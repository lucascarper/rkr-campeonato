"""Ponte entre o banco (Django) e o módulo de regras (Python puro).

- `recalculate(season)`: recalcula os pontos de cada resultado e a classificação após cada etapa.
- `load_category_data(season, category)`: resultados de uma categoria prontos para as regras,
  com cache por versão dos dados.
"""

import json
import logging
import urllib.request
from collections import defaultdict
from dataclasses import dataclass, field

from django.conf import settings
from django.core.cache import cache
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import F, Prefetch

from rules import ScoredResult, ScoringConfig, race_points, standings_by_event
from rules.discard import apply_discards, find_absences

from .models import (
    Category,
    Driver,
    Event,
    Penalty,
    RaceResult,
    ScoringTable,
    Season,
    SeasonConfig,
    Standing,
)

logger = logging.getLogger(__name__)


def current_season(year: int | str | None = None) -> Season | None:
    qs = Season.objects.all()
    if year:
        return qs.filter(year=int(year)).first()
    return qs.order_by("-year").first()


def season_config(season: Season) -> SeasonConfig:
    config, _ = SeasonConfig.objects.get_or_create(season=season)
    return config


def scoring_config(config: SeasonConfig) -> ScoringConfig:
    return ScoringConfig(
        pole_bonus=float(config.pole_bonus),
        fastest_lap_bonus=float(config.fastest_lap_bonus),
        fastest_lap_min_position=config.fastest_lap_min_position,
        dnf_points=float(config.dnf_points),
        shirt_penalty=float(config.shirt_penalty),
    )


def photo_url(path: str) -> str | None:
    if not path:
        return None
    if settings.MEDIA_VIA_API:
        return f"{settings.MEDIA_URL}{path}"  # mesma origem do site; o Next repassa /media à api
    return default_storage.url(path)


def effective_categories(season: Season) -> dict[int, int]:
    """Categoria de cada piloto para os pontos da pré-temporada.

    Usa a categoria do cadastro; sem ela, a categoria da corrida mais recente do piloto.
    """
    mapping = dict(Driver.objects.exclude(category=None).values_list("id", "category_id"))
    latest = (
        RaceResult.objects.filter(active=True, race__event__season=season)
        .exclude(race__category=None)
        .order_by("race__event__number", "race__order")
        .values_list("driver_id", "race__category_id")
    )
    derived = dict(latest)  # a última corrida de cada piloto prevalece
    for driver_id, category_id in derived.items():
        mapping.setdefault(driver_id, category_id)
    return mapping


@transaction.atomic
def recalculate(season: Season) -> dict:
    """Recalcula os pontos de todos os resultados e a classificação de cada categoria."""
    config = season_config(season)
    scoring = scoring_config(config)
    tables = {t.id: t.as_dict() for t in ScoringTable.objects.filter(season=season).prefetch_related("rules")}
    default_table_id = (
        ScoringTable.objects.filter(season=season, is_default=True).values_list("id", flat=True).first()
    )

    results = list(RaceResult.objects.filter(active=True, race__event__season=season).select_related("race"))
    changed = []
    for result in results:
        table = tables.get(result.race.scoring_table_id or default_table_id, {})
        points = race_points(
            position=result.position,
            status=result.status,
            table=table,
            config=scoring,
            pole=result.pole,
            fastest_lap=result.fastest_lap,
            shirt_penalty=result.shirt_penalty,
        )
        if float(result.points) != points:
            result.points = points
            changed.append(result)
    RaceResult.objects.bulk_update(changed, ["points"], batch_size=500)

    Event.objects.filter(season=season, races__results__active=True).update(status=Event.DONE)

    Standing.objects.filter(season=season).delete()
    created = 0
    for category in Category.objects.all():
        data = _build_category_data(season, category)
        if not data.results:
            continue
        cuts = standings_by_event(
            data.results, data.registered, config.tiebreak_order, event_numbers=data.event_numbers
        )
        rows = []
        for number, standing in cuts.items():
            for row in standing:
                upto = [r for r in data.by_driver.get(row.driver_id, []) if r.event_number <= number]
                with_discard, _ = apply_discards(
                    upto,
                    config.discards,
                    find_absences(upto, data.total_race_slots, upto=number),
                    config.discard_absences,
                )
                rows.append(
                    Standing(
                        season=season,
                        category=category,
                        upto_event=number,
                        driver_id=row.driver_id,
                        position=row.position,
                        previous_position=row.previous_position,
                        points=row.points,
                        points_with_discard=with_discard,
                        races=row.races,
                        wins=row.wins,
                        podiums=row.podiums,
                        poles=row.poles,
                        fastest_laps=row.fastest_laps,
                        gap_to_leader=row.gap_to_leader,
                        per_event={str(k): v for k, v in row.per_event.items()},
                    )
                )
        Standing.objects.bulk_create(rows, batch_size=1000)
        created += len(rows)

    Season.objects.filter(pk=season.pk).update(data_version=F("data_version") + 1)
    season.refresh_from_db()
    cache.clear()
    return {"results": len(results), "points_changed": len(changed), "standings": created}


# --- dados por categoria ------------------------------------------------------------------------


@dataclass
class CategoryData:
    results: list[ScoredResult] = field(default_factory=list)
    by_driver: dict[int, list[ScoredResult]] = field(default_factory=dict)
    registered: list[int] = field(default_factory=list)
    event_numbers: list[int] = field(default_factory=list)
    total_race_slots: dict[int, int] = field(default_factory=dict)  # etapa -> corridas por piloto
    meta: dict[int, dict] = field(default_factory=dict)  # result_id -> dados de exibição
    availability: dict[str, bool] = field(default_factory=dict)


def _build_category_data(season: Season, category: Category) -> CategoryData:
    categories = effective_categories(season)
    preseason_drivers = {d for d, c in categories.items() if c == category.id}
    qs = (
        RaceResult.objects.filter(active=True, race__event__season=season)
        .select_related("race__event")
        .prefetch_related(Prefetch("penalty_set", queryset=Penalty.objects.all()))
        .order_by("race__event__number", "race__order", "position")
    )
    data = CategoryData()
    slots: dict[int, set] = defaultdict(set)
    for result in qs:
        race = result.race
        if race.category_id is None:
            if result.driver_id not in preseason_drivers:
                continue
        elif race.category_id != category.id:
            continue
        penalties = list(result.penalty_set.all())
        scored = ScoredResult(
            result_id=result.id,
            driver_id=result.driver_id,
            event_number=race.event.number,
            sequence=race.event.number * 100 + race.order,
            race_label=race.label,
            position=result.position,
            status=result.status,
            points=float(result.points),
            pole=result.pole,
            fastest_lap=result.fastest_lap,
            penalties=len(penalties),
            penalty_seconds=float(sum(p.seconds for p in penalties)),
            start_position=result.start_position,
            best_lap_ms=result.best_lap_ms,
        )
        data.results.append(scored)
        data.by_driver.setdefault(result.driver_id, []).append(scored)
        # Na pré-temporada cada piloto corre uma bateria por etapa; na categoria, cada corrida conta.
        slots[race.event.number].add("pre" if race.category_id is None else race.id)
        data.meta[result.id] = {
            "event": race.event.number,
            "label": race.label,
            "date": race.event.date.isoformat() if race.event.date else None,
            "location": race.event.location,
            "preseason": race.category_id is None,
            "penalties": [
                {"kind": p.get_kind_display(), "seconds": float(p.seconds), "reason": p.reason}
                for p in penalties
            ],
            "notes": result.notes,
        }
    # Inscritos na categoria entram na classificação mesmo sem resultado (com 0 ponto), como na planilha.
    enrolled = Driver.objects.filter(category=category, active=True, merged_into=None, hidden=False)
    data.registered = sorted(set(data.by_driver) | set(enrolled.values_list("id", flat=True)))
    data.event_numbers = sorted(slots)
    data.total_race_slots = {n: len(s) for n, s in slots.items()}
    data.availability = {
        "pole": any(r.pole for r in data.results),
        "start_position": any(r.start_position for r in data.results),
        "best_lap": any(r.best_lap_ms for r in data.results),
        "status": True,
    }
    return data


def load_category_data(season: Season, category: Category) -> CategoryData:
    key = f"catdata:{season.id}:{season.data_version}:{category.id}"
    data = cache.get(key)
    if data is None:
        data = _build_category_data(season, category)
        cache.set(key, data)
    return data


def drivers_by_id(ids) -> dict[int, Driver]:
    return {d.id: d for d in Driver.objects.filter(id__in=list(ids)).select_related("category")}


def driver_payload(driver: Driver, *, large: bool = False) -> dict:
    if driver.hidden:
        return {
            "id": driver.id,
            "slug": driver.slug,
            "name": "Piloto",
            "nickname": "",
            "number": None,
            "photo": None,
            "hidden": True,
        }
    return {
        "id": driver.id,
        "slug": driver.slug,
        "name": driver.name,
        "nickname": driver.nickname,
        "number": driver.number,
        "photo": photo_url(driver.photo if large else driver.photo_thumb),
        "hidden": False,
    }


# --- aviso ao frontend --------------------------------------------------------------------------


def revalidate_web() -> bool:
    """Pede ao serviço web para renovar o cache das páginas públicas."""
    url, secret = settings.WEB_REVALIDATE_URL, settings.REVALIDATE_SECRET
    if not url or not secret:
        return False
    body = json.dumps({"tags": ["rkr"]}).encode()
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {secret}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:  # noqa: S310 (URL de configuração)
            return 200 <= response.status < 300
    except Exception:  # o site continua funcionando; o cache expira sozinho
        logger.warning("Falha ao revalidar o web em %s", url, exc_info=True)
        return False
