"""Fluxo de importação: pré-visualização -> vínculo de pilotos -> confirmação -> recálculo -> desfazer."""

import difflib
import hashlib
import json
import logging
from collections import defaultdict

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from championship import services
from championship.models import (
    Category,
    Driver,
    Event,
    ImportBatch,
    Penalty,
    Race,
    RaceResult,
    ScoringTable,
    Season,
    SeasonConfig,
    Standing,
    normalize_name,
)
from rules import ScoredResult, compute_standings, race_points
from rules.types import FIN

from .parsers import ImportFormatError, ParsedImport, parse_file, validate

SUGGESTION_CUTOFF = 0.8
logger = logging.getLogger(__name__)


class ImportFlowError(Exception):
    """Erro de fluxo (ex.: confirmar uma importação que não está em pré-visualização)."""


# --- pré-visualização ---------------------------------------------------------------------------


def preview(filename: str, content: bytes, author) -> ImportBatch:
    codes = list(Category.objects.values_list("code", flat=True))
    try:
        parsed = parse_file(filename, content, codes)
    except ImportFormatError as exc:
        parsed = ParsedImport(format="?")
        parsed.error(str(exc))
    validate(parsed)
    payload = parsed.to_dict()
    report = build_report(payload, payload["issues"])
    batch = ImportBatch.objects.create(
        filename=filename[:255],
        author=author if getattr(author, "is_authenticated", False) else None,
        rows=sum(len(r["rows"]) for r in payload["races"]),
        payload=payload,
        report=report,
    )
    try:
        batch.file.save(filename, ContentFile(content), save=True)
    except Exception as exc:  # bucket indisponível ou mal configurado não pode travar a importação
        logger.exception("Falha ao guardar a planilha %s no storage", filename)
        batch.report["issues"].append(
            {
                "level": "warning",
                "message": "A cópia da planilha não foi guardada para auditoria (erro no armazenamento de "
                f"arquivos: {type(exc).__name__}). A importação funciona normalmente; "
                "confira as variáveis S3_* da api.",
                "sheet": "",
                "line": None,
                "column": "",
            }
        )
        batch.report["warnings"] += 1
        batch.save(update_fields=["report"])
    return batch


def build_report(payload: dict, issues: list[dict]) -> dict:
    issues = [dict(i) for i in issues]
    races = payload["races"]
    seasons = sorted({r["season"] for r in races})
    tables, table_issues = _resolve_tables(races, seasons)
    issues += table_issues

    # Pilotos das corridas e também os inscritos nas abas de categoria (mesmo sem corrida).
    names = {row["driver"] for race in races for row in race["rows"]}
    names |= set(payload.get("category_assignments", {}))
    names = sorted(names, key=normalize_name)
    drivers = [_match_driver(name) for name in names]

    replacements = []
    for race in races:
        if not race["rows"]:
            continue
        state, existing = _race_state(race)
        replacements.append(
            {
                "key": race["key"],
                "event": race["event_number"],
                "label": race["label"],
                "category": race["category"],
                "rows": len(race["rows"]),
                "state": state,
                "existing_rows": existing,
                "table": tables.get(race["key"]),
            }
        )

    events = {}
    for race in races:
        ev = events.setdefault(
            (race["season"], race["event_number"]),
            {
                "season": race["season"],
                "number": race["event_number"],
                "date": race["date"],
                "location": race["location"],
                "done": False,
                "races": 0,
                "preseason": race["category"] is None,
            },
        )
        ev["done"] = ev["done"] or bool(race["rows"])
        ev["races"] += 1 if race["rows"] else 0

    try:
        movements = _projected_movements(payload, tables, {r["key"]: r["state"] for r in replacements})
    except Exception:  # a prévia de posições é informativa: nunca pode travar a importação
        logger.exception("Falha ao projetar a classificação da importação")
        movements = {"compared": False, "rows": []}

    check = _official_check(payload, tables)
    for item in check:
        if not item["ok"]:
            issues.append(
                {
                    "level": "warning",
                    "message": f"{item['driver']} ({item['category']}): calculado {item['computed']} "
                    f"x planilha {item['official']}",
                    "sheet": item["category"],
                    "line": None,
                    "column": "Pontos",
                }
            )
    errors = [i for i in issues if i["level"] == "error"]
    return {
        "format": payload["format"],
        "seasons": seasons,
        "columns": payload.get("columns", []),
        "events": sorted(events.values(), key=lambda e: (e["season"], e["number"])),
        "races": replacements,
        "drivers": drivers,
        "pending_drivers": [d["name"] for d in drivers if d["status"] == "suggestion"],
        "issues": issues,
        "errors": len(errors),
        "warnings": len(issues) - len(errors),
        "movements": movements,
        "official_check": {
            "checked": len(check),
            "mismatches": sum(1 for c in check if not c["ok"]),
        },
        "summary": {
            "new": sum(1 for r in replacements if r["state"] == "new"),
            "replace": sum(1 for r in replacements if r["state"] == "replace"),
            "unchanged": sum(1 for r in replacements if r["state"] == "unchanged"),
        },
    }


def _match_driver(name: str) -> dict:
    key = normalize_name(name)
    exact = Driver.objects.filter(normalized_name=key, merged_into=None).first()
    if exact:
        return {"name": name, "status": "matched", "driver": {"id": exact.id, "name": exact.name}}
    candidates = list(Driver.objects.filter(merged_into=None).values_list("id", "name", "normalized_name"))
    scored = sorted(
        (
            (difflib.SequenceMatcher(None, key, norm).ratio(), driver_id, driver_name)
            for driver_id, driver_name, norm in candidates
        ),
        reverse=True,
    )
    suggestions = [
        {"id": driver_id, "name": driver_name, "score": round(score, 2)}
        for score, driver_id, driver_name in scored[:3]
        if score >= SUGGESTION_CUTOFF
    ]
    return {"name": name, "status": "suggestion" if suggestions else "new", "suggestions": suggestions}


def _resolve_tables(races: list[dict], seasons: list[int]) -> tuple[dict[str, str], list[dict]]:
    """Descobre a tabela de pontos de cada corrida.

    Se a planilha informa a tabela, usa-a. Se traz os pontos da posição (coluna "Corrida" da
    planilha da organização), escolhe a tabela que reproduz esses pontos. Senão, a padrão.
    """
    issues: list[dict] = []
    by_season = {
        s.year: list(ScoringTable.objects.filter(season=s).prefetch_related("rules"))
        for s in Season.objects.filter(year__in=seasons)
    }
    resolved: dict[str, str] = {}
    for race in races:
        if not race["rows"]:
            continue
        tables = by_season.get(race["season"], [])
        where = {"sheet": race["sheet"], "line": race["line"], "column": ""}
        if not tables:
            issues.append(
                {
                    "level": "error",
                    "message": f"Temporada {race['season']} sem tabela de pontos. "
                    "Cadastre em Regras antes de importar.",
                    **where,
                }
            )
            continue
        if race.get("table"):
            match = next((t for t in tables if normalize_name(t.name) == normalize_name(race["table"])), None)
            if not match:
                issues.append(
                    {"level": "error", "message": f"Tabela de pontos desconhecida: {race['table']}", **where}
                )
                continue
            resolved[race["key"]] = match.name
            continue
        observed = [
            (row["position"], row["race_points"])
            for row in race["rows"]
            if row["race_points"] is not None and row["position"] and row["status"] == FIN
        ]
        default = next((t for t in tables if t.is_default), tables[0])
        if not observed:
            resolved[race["key"]] = default.name
            continue
        candidates = [default] + [t for t in tables if t != default]
        match = next(
            (t for t in candidates if all(t.as_dict().get(p, 0) == pts for p, pts in observed)), None
        )
        if match:
            resolved[race["key"]] = match.name
        else:
            seq = ", ".join(f"{p}º={int(pts) if pts == int(pts) else pts}" for p, pts in sorted(observed)[:8])
            issues.append(
                {
                    "level": "error",
                    "message": f"Etapa {race['event_number']} {race['label']}: pontos da planilha ({seq}…) "
                    "não batem com nenhuma tabela cadastrada. Cadastre a tabela em Regras.",
                    **where,
                }
            )
    return resolved, issues


def _race_signature(rows: list[dict]) -> str:
    """Assinatura do conteúdo de uma corrida, para saber se o reenvio muda algo."""
    items = sorted(
        (
            normalize_name(r["driver"]),
            r["position"],
            r["status"],
            bool(r["pole"]),
            bool(r["fastest_lap"]),
            bool(r["shirt_penalty"]),
            r.get("start_position"),
            r.get("best_lap_ms"),
            r.get("laps"),
            len(r.get("penalties", [])),
            round(sum(float(p.get("seconds") or 0) for p in r.get("penalties", [])), 1),
            (r.get("notes") or "").strip(),
        )
        for r in rows
    )
    return hashlib.sha1(json.dumps(items, default=str).encode()).hexdigest()


def _existing_race(race: dict) -> Race | None:
    qs = Race.objects.filter(
        event__season__year=race["season"], event__number=race["event_number"], label=race["label"]
    )
    qs = qs.filter(category=None) if race["category"] is None else qs.filter(category__code=race["category"])
    return qs.first()


def _race_state(race: dict) -> tuple[str, int]:
    existing = _existing_race(race)
    if not existing:
        return "new", 0
    rows = list(existing.results.filter(active=True).select_related("driver").prefetch_related("penalty_set"))
    if not rows:
        return "new", 0
    current = [
        {
            "driver": r.driver.name,
            "position": r.position,
            "status": r.status,
            "pole": r.pole,
            "fastest_lap": r.fastest_lap,
            "shirt_penalty": r.shirt_penalty,
            "start_position": r.start_position,
            "best_lap_ms": r.best_lap_ms,
            "laps": r.laps,
            "penalties": [{"seconds": float(p.seconds)} for p in r.penalty_set.all()],
            "notes": r.notes,
        }
        for r in rows
    ]
    same = _race_signature(current) == _race_signature(race["rows"])
    return ("unchanged" if same else "replace"), len(rows)


def _projected_movements(payload: dict, tables: dict[str, str], states: dict[str, str]) -> dict:
    """Classificação como ficaria depois de gravar, comparada à atual (quem sobe, cai ou entra).

    Junta os resultados já gravados (exceto as corridas que o arquivo substitui) com as linhas do
    arquivo, pontua pelas regras da temporada e calcula a classificação final de cada categoria.
    """
    incoming = [
        r
        for r in payload["races"]
        if r["rows"] and r["key"] in tables and states.get(r["key"]) != "unchanged"
    ]
    if not incoming:
        return {"compared": True, "rows": []}
    assignments = {normalize_name(k): v for k, v in payload.get("category_assignments", {}).items()}
    norm_to_id = dict(Driver.objects.filter(merged_into=None).values_list("normalized_name", "id"))
    names = dict(Driver.objects.values_list("id", "name"))
    category_codes = dict(Category.objects.values_list("id", "code"))
    rows: list[dict] = []
    compared = True

    for year in sorted({r["season"] for r in incoming}):
        season = Season.objects.filter(year=year).first()
        if not season:
            compared = False
            continue
        config = services.season_config(season)
        scoring = services.scoring_config(config)
        table_map = {t.name: t.as_dict() for t in season.scoring_tables.prefetch_related("rules")}
        effective = services.effective_categories(season)
        replaced = {r["key"] for r in incoming if r["season"] == year}

        def category_for(driver, name, race_category, effective=effective):
            if race_category:
                return race_category
            return assignments.get(normalize_name(name)) or category_codes.get(effective.get(driver))

        per_category: dict[str, list[ScoredResult]] = defaultdict(list)
        existing = RaceResult.objects.filter(active=True, race__event__season=season).select_related(
            "race__event", "race__category", "driver"
        )
        for result in existing:
            race = result.race
            key = f"{year}|{race.event.number}|{race.label}|{race.category.code if race.category else ''}"
            if key in replaced:
                continue
            code = category_for(
                result.driver_id, result.driver.name, race.category.code if race.category else None
            )
            if code:
                per_category[code].append(
                    ScoredResult(
                        result_id=f"db{result.id}",
                        driver_id=result.driver_id,
                        event_number=race.event.number,
                        sequence=race.event.number * 100 + race.order,
                        race_label=race.label,
                        position=result.position,
                        status=result.status,
                        points=float(result.points),
                        pole=result.pole,
                        fastest_lap=result.fastest_lap,
                    )
                )
        for race in (r for r in incoming if r["season"] == year):
            table = table_map.get(tables[race["key"]], {})
            for index, row in enumerate(race["rows"]):
                key = normalize_name(row["driver"])
                driver = norm_to_id.get(key, f"novo:{row['driver']}")
                code = category_for(driver, row["driver"], race["category"])
                if not code:
                    continue
                per_category[code].append(
                    ScoredResult(
                        result_id=f"{race['key']}#{index}",
                        driver_id=driver,
                        event_number=race["event_number"],
                        sequence=race["event_number"] * 100 + race["order"],
                        race_label=race["label"],
                        position=row["position"],
                        status=row["status"],
                        points=race_points(
                            position=row["position"],
                            status=row["status"],
                            table=table,
                            config=scoring,
                            pole=row["pole"],
                            fastest_lap=row["fastest_lap"],
                            shirt_penalty=row["shirt_penalty"],
                        ),
                        pole=row["pole"],
                        fastest_lap=row["fastest_lap"],
                    )
                )

        for code, results in sorted(per_category.items()):
            category = Category.objects.get(code=code)
            latest = Standing.objects.filter(season=season, category=category).aggregate(m=Max("upto_event"))[
                "m"
            ]
            if latest is None:
                compared = False  # primeira importação da categoria: não há com o que comparar
                continue
            before = {
                s.driver_id: (s.position, float(s.points))
                for s in Standing.objects.filter(season=season, category=category, upto_event=latest)
            }
            for row in compute_standings(
                results, tiebreak=config.tiebreak_order, podium=config.podium_positions
            ):
                prev = before.get(row.driver_id)
                if prev and prev[0] == row.position and abs(prev[1] - row.points) < 0.01:
                    continue
                name = (
                    row.driver_id.split(":", 1)[1]
                    if isinstance(row.driver_id, str)
                    else names.get(row.driver_id)
                )
                rows.append(
                    {
                        "category": code,
                        "driver": name,
                        "before_position": prev[0] if prev else None,
                        "after_position": row.position,
                        "before_points": prev[1] if prev else None,
                        "after_points": row.points,
                        "change": (prev[0] - row.position) if prev else None,
                    }
                )
    rows.sort(key=lambda r: (r["category"], r["after_position"]))
    return {"compared": compared, "rows": rows}


def _official_check(payload: dict, tables: dict[str, str]) -> list[dict]:
    """Confere os totais calculados com as abas RK1/RK2/RK3 da planilha, quando existirem."""
    official = payload.get("official_totals") or {}
    if not official:
        return []
    assignments = {normalize_name(k): v for k, v in payload.get("category_assignments", {}).items()}
    totals: dict[tuple[str, str], float] = defaultdict(float)
    names: dict[str, str] = {}
    configs = {}
    for race in payload["races"]:
        season = Season.objects.filter(year=race["season"]).first()
        if not season or race["key"] not in tables:
            continue
        if season.id not in configs:
            configs[season.id] = (
                services.scoring_config(services.season_config(season)),
                {t.name: t.as_dict() for t in season.scoring_tables.prefetch_related("rules")},
            )
        scoring, table_map = configs[season.id]
        table = table_map[tables[race["key"]]]
        for row in race["rows"]:
            key = normalize_name(row["driver"])
            category = race["category"] or assignments.get(key)
            if not category:
                continue
            names[key] = row["driver"]
            totals[(category, key)] += race_points(
                position=row["position"],
                status=row["status"],
                table=table,
                config=scoring,
                pole=row["pole"],
                fastest_lap=row["fastest_lap"],
                shirt_penalty=row["shirt_penalty"],
            )
    check = []
    for category, drivers in official.items():
        for name, points in drivers.items():
            computed = round(totals.get((category, normalize_name(name)), 0), 2)
            check.append(
                {
                    "category": category,
                    "driver": name,
                    "official": points,
                    "computed": computed,
                    "ok": abs(computed - points) < 0.01,
                }
            )
    return check


# --- confirmação --------------------------------------------------------------------------------


@transaction.atomic
def confirm(batch: ImportBatch, driver_choices: dict[str, dict] | None = None) -> dict:
    batch = ImportBatch.objects.select_for_update().get(pk=batch.pk)
    if batch.status != ImportBatch.PREVIEW:
        raise ImportFlowError("Esta importação não está aguardando confirmação.")
    # Reavalia com o estado atual do banco (outra importação pode ter sido gravada no meio tempo).
    report = build_report(batch.payload, batch.payload.get("issues", []))
    if report["errors"]:
        raise ImportFlowError("Há erros bloqueantes na planilha. Corrija e envie novamente.")

    driver_choices = driver_choices or {}
    missing = [n for n in report["pending_drivers"] if n not in driver_choices]
    if missing:
        raise ImportFlowError("Resolva os pilotos pendentes: " + ", ".join(missing))
    drivers = _resolve_drivers(report["drivers"], driver_choices)

    tables_by_race = {r["key"]: r["table"] for r in report["races"]}
    states = {r["key"]: r["state"] for r in report["races"]}
    # A data da etapa é a da primeira corrida (as baterias da pré-temporada podem cair em dias diferentes).
    event_dates: dict[tuple, str] = {}
    for race_data in batch.payload["races"]:
        key = (race_data["season"], race_data["event_number"])
        if race_data["date"] and (key not in event_dates or race_data["date"] < event_dates[key]):
            event_dates[key] = race_data["date"]
    touched_seasons: set[int] = set()
    written = 0
    for race_data in batch.payload["races"]:
        season, _ = Season.objects.get_or_create(year=race_data["season"])
        SeasonConfig.objects.get_or_create(season=season)
        touched_seasons.add(season.id)
        event, _ = Event.objects.get_or_create(season=season, number=race_data["event_number"])
        event.is_preseason = race_data["category"] is None
        event.date = event_dates.get((race_data["season"], race_data["event_number"])) or event.date
        if race_data["location"]:
            event.location = race_data["location"]
        event.save()
        if not race_data["rows"] or states.get(race_data["key"]) == "unchanged":
            continue

        category = Category.objects.get(code=race_data["category"]) if race_data["category"] else None
        race = _existing_race(race_data) or Race(event=event, label=race_data["label"], category=category)
        race.order = race_data["order"]
        race.start_time = race_data.get("start_time")
        race.scoring_table = ScoringTable.objects.filter(
            season=season, name=tables_by_race.get(race_data["key"])
        ).first()
        race.save()
        race.results.filter(active=True).update(active=False, replaced_by=batch)

        for row in race_data["rows"]:
            result = RaceResult.objects.create(
                race=race,
                category=category,
                driver=drivers[row["driver"]],
                position=row["position"],
                start_position=row.get("start_position"),
                best_lap_ms=row.get("best_lap_ms"),
                laps=row.get("laps"),
                status=row["status"],
                pole=row["pole"],
                fastest_lap=row["fastest_lap"],
                shirt_penalty=row["shirt_penalty"],
                sheet_points=row.get("sheet_points"),
                notes=(row.get("notes") or "")[:200],
                import_batch=batch,
            )
            Penalty.objects.bulk_create(
                Penalty(
                    result=result,
                    kind=p["kind"],
                    seconds=p.get("seconds") or 0,
                    positions=p.get("positions") or 0,
                    reason=(p.get("reason") or "")[:200],
                )
                for p in row.get("penalties", [])
            )
            written += 1

    for name, code in batch.payload.get("category_assignments", {}).items():
        driver = drivers[name]
        if driver.category is None or driver.category.code != code:
            driver.category = Category.objects.get(code=code)
            driver.save(update_fields=["category"])

    batch.status = ImportBatch.CONFIRMED
    batch.confirmed_at = timezone.now()
    batch.rows_written = written
    batch.report = {**batch.report, "confirmed_summary": report["summary"]}
    batch.save()
    for season in Season.objects.filter(id__in=touched_seasons):
        services.recalculate(season)
    transaction.on_commit(services.revalidate_web)
    return {"rows_written": written, **report["summary"]}


def _resolve_drivers(matches: list[dict], choices: dict[str, dict]) -> dict[str, Driver]:
    resolved: dict[str, Driver] = {}
    for match in matches:
        name = match["name"]
        choice = choices.get(name)
        if choice and choice.get("action") == "link":
            driver = Driver.objects.get(pk=choice["driver_id"])
            while driver.merged_into_id:
                driver = driver.merged_into
            resolved[name] = driver
        elif choice and choice.get("action") == "create":
            resolved[name] = Driver.objects.create(name=name)
        elif match["status"] == "matched":
            resolved[name] = Driver.objects.get(pk=match["driver"]["id"])
        else:
            # Pode ter sido criado por outra linha com a mesma grafia normalizada.
            existing = Driver.objects.filter(normalized_name=normalize_name(name), merged_into=None).first()
            resolved[name] = existing or Driver.objects.create(name=name)
    return resolved


# --- desfazer -----------------------------------------------------------------------------------


@transaction.atomic
def undo(batch: ImportBatch) -> dict:
    batch = ImportBatch.objects.select_for_update().get(pk=batch.pk)
    if batch.status == ImportBatch.PREVIEW:
        batch.status = ImportBatch.DISCARDED
        batch.save(update_fields=["status"])
        return {"removed": 0, "restored": 0}
    if batch.status != ImportBatch.CONFIRMED:
        raise ImportFlowError("Só é possível desfazer uma importação confirmada.")
    blockers = (
        ImportBatch.objects.filter(replaced_results__import_batch=batch, status=ImportBatch.CONFIRMED)
        .exclude(pk=batch.pk)
        .distinct()
    )
    if blockers.exists():
        ids = ", ".join(f"#{b.pk}" for b in blockers)
        raise ImportFlowError(f"Resultados deste lote foram substituídos depois. Desfaça antes: {ids}.")

    seasons = set(
        Season.objects.filter(events__races__results__import_batch=batch).values_list("id", flat=True)
    ) | set(Season.objects.filter(events__races__results__replaced_by=batch).values_list("id", flat=True))
    own = RaceResult.objects.filter(import_batch=batch, active=True)
    removed = own.count()
    own.delete()
    restored = RaceResult.objects.filter(replaced_by=batch).update(active=True, replaced_by=None)
    batch.status = ImportBatch.UNDONE
    batch.save(update_fields=["status"])
    for season in Season.objects.filter(id__in=seasons):
        services.recalculate(season)
    transaction.on_commit(services.revalidate_web)
    return {"removed": removed, "restored": restored}
