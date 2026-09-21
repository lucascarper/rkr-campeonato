"""Endpoints públicos (somente leitura, sem login)."""

from django.core.cache import cache
from django.db import connection
from django.http import Http404
from rest_framework.decorators import api_view
from rest_framework.response import Response

from rules import apply_discards, standings_by_event
from rules.discard import find_absences
from rules.stats import build_dashboard, driver_stats

from . import services
from .models import Category, Driver, Event, Standing


def _season(request):
    season = services.current_season(request.query_params.get("season"))
    if not season:
        raise Http404("Temporada não encontrada")
    return season


def _category(request, default: str | None = "RK1") -> Category:
    code = (request.query_params.get("category") or default or "").upper()
    category = Category.objects.filter(code=code).first()
    if not category:
        raise Http404("Categoria não encontrada")
    return category


def _int_param(request, name: str) -> int | None:
    value = request.query_params.get(name)
    try:
        return int(value) if value not in (None, "") else None
    except ValueError:
        return None


def _cached(key: str, builder):
    data = cache.get(key)
    if data is None:
        data = builder()
        cache.set(key, data)
    return data


def _event_payload(event: Event) -> dict:
    return {
        "number": event.number,
        "label": f"E{event.number}",
        "date": event.date.isoformat() if event.date else None,
        "location": event.location,
        "status": event.status,
        "preseason": event.is_preseason,
    }


@api_view(["GET"])
def health(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    return Response({"status": "ok"})


@api_view(["GET"])
def categories(request):
    return Response(
        [{"code": c.code, "name": c.name, "order": c.display_order} for c in Category.objects.all()]
    )


@api_view(["GET"])
def events(request):
    season = _season(request)
    races = {}
    for event in season.events.prefetch_related("races__category"):
        races[event.number] = [
            {"label": r.label, "category": r.category.code if r.category else None} for r in event.races.all()
        ]
    return Response(
        {
            "season": season.year,
            "events": [{**_event_payload(e), "races": races.get(e.number, [])} for e in season.events.all()],
        }
    )


@api_view(["GET"])
def standings(request):
    season = _season(request)
    category = _category(request)
    upto_param = _int_param(request, "upto")
    key = f"standings:{season.id}:{season.data_version}:{category.id}:{upto_param}"
    return Response(_cached(key, lambda: _standings(season, category, upto_param)))


def _standings(season, category, upto_param):
    cuts = sorted(
        set(Standing.objects.filter(season=season, category=category).values_list("upto_event", flat=True))
    )
    event_map = {e.number: e for e in season.events.all()}
    base = {
        "season": season.year,
        "category": {"code": category.code, "name": category.name},
        "cuts": cuts,
        "events": [_event_payload(event_map[n]) for n in cuts if n in event_map],
        "calendar": [_event_payload(e) for e in event_map.values()],
        "upto": None,
        "rows": [],
    }
    if not cuts:
        return base
    upto = max((c for c in cuts if upto_param is None or c <= upto_param), default=cuts[0])
    rows = list(
        Standing.objects.filter(season=season, category=category, upto_event=upto).select_related("driver")
    )
    visible_events = [n for n in cuts if n <= upto]
    base.update(
        upto=upto,
        events=[_event_payload(event_map[n]) for n in visible_events if n in event_map],
        rows=[
            {
                "position": s.position,
                "previous_position": s.previous_position,
                "delta": (s.previous_position - s.position) if s.previous_position else None,
                "driver": services.driver_payload(s.driver),
                "points": float(s.points),
                "per_event": {n: s.per_event.get(str(n)) for n in visible_events},
                "races": s.races,
                "wins": s.wins,
                "podiums": s.podiums,
                "poles": s.poles,
                "fastest_laps": s.fastest_laps,
                "gap_to_leader": float(s.gap_to_leader),
            }
            for s in rows
        ],
    )
    return base


@api_view(["GET"])
def dashboard(request):
    season = _season(request)
    category = _category(request)
    start, end = _int_param(request, "from"), _int_param(request, "to")
    key = f"dashboard:{season.id}:{season.data_version}:{category.id}:{start}:{end}"
    return Response(_cached(key, lambda: _dashboard(season, category, start, end)))


def _dashboard(season, category, start, end):
    data = services.load_category_data(season, category)
    config = services.season_config(season)
    events = [n for n in data.event_numbers if (start is None or n >= start) and (end is None or n <= end)]
    results = [r for r in data.results if r.event_number in events]
    cuts = standings_by_event(
        data.results,
        data.registered,
        config.tiebreak_order,
        data.event_numbers,
        podium=config.podium_positions,
    )
    cuts = {n: rows for n, rows in cuts.items() if n in events}
    board = build_dashboard(
        results,
        event_numbers=events,
        total_races=sum(data.total_race_slots.get(n, 0) for n in events),
        cuts=cuts,
        top_n=config.consistency_top_n,
        podium=config.podium_positions,
        availability=data.availability,
    )
    board.pop("driver_stats")
    ids = {r.driver_id for r in results}
    event_map = {e.number: e for e in season.events.all()}
    return {
        "season": season.year,
        "category": {"code": category.code, "name": category.name},
        "range": {"from": events[0] if events else None, "to": events[-1] if events else None},
        "all_events": [_event_payload(event_map[n]) for n in data.event_numbers if n in event_map],
        "availability": data.availability,
        "podium_positions": config.podium_positions,
        "drivers": {d.id: services.driver_payload(d) for d in services.drivers_by_id(ids).values()},
        **board,
    }


@api_view(["GET"])
def driver_detail(request, slug: str):
    season = _season(request)
    driver = Driver.objects.filter(slug=slug, merged_into=None).select_related("category").first()
    if not driver or driver.hidden:
        raise Http404("Piloto não encontrado")
    code = request.query_params.get("category")
    if code:
        category = _category(request)
    else:
        category_id = services.effective_categories(season).get(driver.id)
        category = Category.objects.filter(pk=category_id).first() or Category.objects.first()
    upto = _int_param(request, "upto")
    key = f"driver:{season.id}:{season.data_version}:{category.id}:{driver.id}:{upto}"
    return Response(_cached(key, lambda: _driver(season, category, driver, upto)))


def _driver(season, category, driver, upto_param):
    data = services.load_category_data(season, category)
    config = services.season_config(season)
    events = [n for n in data.event_numbers if upto_param is None or n <= upto_param]
    upto = events[-1] if events else None
    results = sorted(
        (r for r in data.by_driver.get(driver.id, []) if upto is None or r.event_number <= upto),
        key=lambda r: r.sequence,
    )
    absences = find_absences(results, data.total_race_slots, upto=upto)
    with_discard, discarded = apply_discards(results, config.discards, absences, config.discard_absences)
    stats = driver_stats(results, config.consistency_top_n, config.podium_positions)

    standing = {
        s.upto_event: s for s in Standing.objects.filter(season=season, category=category, driver=driver)
    }
    total_drivers = Standing.objects.filter(season=season, category=category, upto_event=upto).count()
    current = standing.get(upto)

    no_discard_series, with_discard_series, positions = [], [], []
    cumulative = cumulative_discard = 0.0
    for number in events:
        event_results = [r for r in results if r.event_number == number]
        cumulative += sum(r.points for r in event_results)
        cumulative_discard += sum(r.points for r in event_results if r.result_id not in discarded)
        no_discard_series.append(round(cumulative, 2))
        with_discard_series.append(round(cumulative_discard, 2))
        positions.append(standing[number].position if number in standing else None)

    event_map = {e.number: e for e in season.events.all()}
    races = []
    for r in results:
        meta = data.meta.get(r.result_id, {})
        races.append(
            {
                "result_id": r.result_id,
                "event": r.event_number,
                "label": r.race_label,
                "date": meta.get("date"),
                "location": meta.get("location"),
                "preseason": meta.get("preseason", False),
                "position": r.position,
                "status": r.status,
                "points": r.points,
                "pole": r.pole,
                "fastest_lap": r.fastest_lap,
                "penalties": meta.get("penalties", []),
                "notes": meta.get("notes", ""),
                "discarded": r.result_id in discarded,
            }
        )

    absence_list = [
        {
            "event": a.event_number,
            "id": a.result_id,
            "date": event_map[a.event_number].date.isoformat()
            if a.event_number in event_map and event_map[a.event_number].date
            else None,
            "location": event_map[a.event_number].location if a.event_number in event_map else "",
            "preseason": event_map[a.event_number].is_preseason if a.event_number in event_map else False,
            "discarded": a.result_id in discarded,
        }
        for a in absences
    ]

    return {
        "driver": {
            **services.driver_payload(driver, large=True),
            "thumb": services.photo_url(driver.photo_thumb) if not driver.hidden else None,
        },
        "season": season.year,
        "category": category.code,
        "category_name": category.name,
        "upto": upto,
        "rank": current.position if current else None,
        "total_drivers": total_drivers,
        "discards": config.discards,
        "discard_absences": config.discard_absences,
        "stats": {
            **{k: v for k, v in stats.items() if k not in ("seconds", "top_n", "std_position")},
            "points": float(current.points) if current else stats["points"],
            "points_with_discard": with_discard,
            "gap_to_leader": float(current.gap_to_leader) if current else None,
        },
        "races": races,
        "absences": absence_list,
        "series": {
            "events": events,
            "labels": [f"Etapa {n}" for n in events],
            "event_info": [_event_payload(event_map[n]) for n in events if n in event_map],
            "no_discard": no_discard_series,
            "with_discard": with_discard_series,
            "positions": positions,
            "discarded_races": sorted(discarded, key=str),
            "discarded_events": sorted(
                {r.event_number for r in results if r.result_id in discarded}
                | {a.event_number for a in absences if a.result_id in discarded}
            ),
        },
    }
