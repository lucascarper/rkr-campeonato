"""Estatísticas por piloto e indicadores do dashboard, por categoria."""

from collections import defaultdict
from collections.abc import Iterable, Sequence
from statistics import mean, pstdev

from .standings import StandingRow
from .types import ScoredResult


def _longest_streak(flags: Iterable[bool]) -> int:
    best = current = 0
    for flag in flags:
        current = current + 1 if flag else 0
        best = max(best, current)
    return best


def driver_stats(results: Sequence[ScoredResult], top_n: int = 5) -> dict:
    """Estatísticas de um piloto a partir dos seus resultados (já filtrados por categoria)."""
    played = [r for r in results if r.participated]
    positions = [r.position for r in played if r.position]
    gains = [r.start_position - r.position for r in played if r.start_position and r.position]
    laps = [r.best_lap_ms for r in played if r.best_lap_ms]
    races = len(played)
    points = round(sum(r.points for r in results), 2)
    return {
        "points": points,
        "races": races,
        "wins": sum(1 for p in positions if p == 1),
        "seconds": sum(1 for p in positions if p == 2),
        "podiums": sum(1 for p in positions if p <= 3),
        "top_n": sum(1 for p in positions if p <= top_n),
        "poles": sum(1 for r in played if r.pole),
        "fastest_laps": sum(1 for r in played if r.fastest_lap),
        "best_position": min(positions) if positions else None,
        "avg_position": round(mean(positions), 2) if positions else None,
        "std_position": round(pstdev(positions), 2) if len(positions) > 1 else 0.0,
        "penalties": sum(r.penalties for r in results),
        "penalty_seconds": round(sum(r.penalty_seconds for r in results), 1),
        "finished": sum(1 for r in played if r.finished),
        "completion_rate": round(100 * sum(1 for r in played if r.finished) / races, 1) if races else None,
        "points_per_race": round(points / races, 2) if races else None,
        "avg_gain": round(mean(gains), 2) if gains else None,
        "best_lap_ms": min(laps) if laps else None,
    }


def _top(items: list[dict], key, limit: int) -> list[dict]:
    return sorted(items, key=key)[:limit]


def _entry(driver_id, value, **detail) -> dict:
    return {"driver_id": driver_id, "value": value, **detail}


def build_dashboard(
    results: Sequence[ScoredResult],
    *,
    event_numbers: Sequence[int],
    total_races: int,
    cuts: dict[int, list[StandingRow]] | None = None,
    top_n: int = 5,
    availability: dict[str, bool] | None = None,
    limit: int = 5,
) -> dict:
    """Indicadores obrigatórios (com Top N) e estatísticas extras de uma categoria.

    `total_races` é o número de corridas realizadas no intervalo (base dos 50% de participação).
    `availability` diz quais colunas opcionais existem; extras sem dado vêm como None
    para o frontend ocultar o cartão em vez de mostrar zeros.
    """
    availability = availability or {}
    by_driver: dict = defaultdict(list)
    for r in results:
        by_driver[r.driver_id].append(r)
    stats = {d: driver_stats(sorted(rs, key=lambda r: r.sequence), top_n) for d, rs in by_driver.items()}
    eligible = {d for d, s in stats.items() if total_races and s["races"] * 2 >= total_races}

    # --- Indicadores obrigatórios -------------------------------------------------------------
    fastest = [
        _entry(d, s["fastest_laps"], best_lap_ms=s["best_lap_ms"], wins=s["wins"])
        for d, s in stats.items()
        if s["fastest_laps"]
    ]
    fastest = _top(fastest, lambda e: (-e["value"], e["best_lap_ms"] or 10**12, -e["wins"]), limit)

    wins = [_entry(d, s["wins"], seconds=s["seconds"]) for d, s in stats.items() if s["wins"]]
    wins = _top(wins, lambda e: (-e["value"], -e["seconds"]), limit)

    consistency = [
        _entry(
            d,
            round(100 * s["top_n"] / s["races"], 1),
            races=s["races"],
            top_n=s["top_n"],
            avg_position=s["avg_position"],
            std_position=s["std_position"],
        )
        for d, s in stats.items()
        if d in eligible and s["races"]
    ]
    consistency = _top(
        consistency, lambda e: (-e["value"], e["avg_position"] or 99, e["std_position"] or 99), limit
    )

    penalties = [
        _entry(d, s["penalties"], seconds=s["penalty_seconds"]) for d, s in stats.items() if s["penalties"]
    ]
    penalties = _top(penalties, lambda e: (-e["value"], e["seconds"]), limit)

    indicators = {
        "fastest_laps": {"top": fastest},
        "wins": {"top": wins},
        "consistency": {"top": consistency, "n": top_n, "min_races": (total_races + 1) // 2},
        "penalties": {
            "top": penalties,
            "total": sum(s["penalties"] for s in stats.values()),
            "total_seconds": round(sum(s["penalty_seconds"] for s in stats.values()), 1),
        },
    }

    # --- Extras ------------------------------------------------------------------------------
    def ranked(field: str, *, reverse: bool, only_eligible: bool = False, skip_zero: bool = True):
        items = [
            _entry(d, s[field], races=s["races"])
            for d, s in stats.items()
            if s[field] is not None and (not skip_zero or s[field]) and (not only_eligible or d in eligible)
        ]
        return _top(items, lambda e: (-e["value"] if reverse else e["value"], -e["races"]), limit)

    ordered_events = sorted(event_numbers)
    streak_points, streak_podiums = [], []
    for d, rs in by_driver.items():
        by_event: dict[int, list[ScoredResult]] = defaultdict(list)
        for r in rs:
            by_event[r.event_number].append(r)
        seq = [sorted(by_event.get(n, []), key=lambda r: r.sequence) or [None] for n in ordered_events]
        flat = [r for group in seq for r in group]
        streak_points.append(_entry(d, _longest_streak(r is not None and r.points > 0 for r in flat)))
        streak_podiums.append(
            _entry(d, _longest_streak(r is not None and bool(r.position) and r.position <= 3 for r in flat))
        )

    extras: dict = {
        "podiums": ranked("podiums", reverse=True),
        "avg_position": ranked("avg_position", reverse=False, only_eligible=True),
        "poles": ranked("poles", reverse=True) if availability.get("pole", True) else None,
        "avg_gain": ranked("avg_gain", reverse=True, skip_zero=False)
        if availability.get("start_position")
        else None,
        "best_lap": ranked("best_lap_ms", reverse=False) if availability.get("best_lap") else None,
        "completion_rate": ranked("completion_rate", reverse=True, only_eligible=True)
        if availability.get("status", True)
        else None,
        "points_per_race": ranked("points_per_race", reverse=True, only_eligible=True),
        "streaks": {
            "points": _top([e for e in streak_points if e["value"]], lambda e: -e["value"], limit),
            "podiums": _top([e for e in streak_podiums if e["value"]], lambda e: -e["value"], limit),
        },
    }

    if cuts:
        extras.update(_evolution(cuts, ordered_events, limit))
    extras["heatmap"] = _heatmap(by_driver, ordered_events, cuts)
    return {
        "total_races": total_races,
        "events": ordered_events,
        "indicators": indicators,
        "extras": extras,
        "driver_stats": stats,
    }


def _evolution(cuts: dict[int, list[StandingRow]], events: list[int], limit: int) -> dict:
    moves = []
    for number in events:
        for row in cuts.get(number, []):
            if row.delta:
                moves.append(
                    {
                        "driver_id": row.driver_id,
                        "value": row.delta,
                        "event": number,
                        "from": row.previous_position,
                        "to": row.position,
                    }
                )
    rises = sorted((m for m in moves if m["value"] > 0), key=lambda m: -m["value"])[:limit]
    falls = sorted((m for m in moves if m["value"] < 0), key=lambda m: m["value"])[:limit]

    final = cuts.get(events[-1], []) if events else []
    contenders = [row.driver_id for row in final[:5]]
    gap_series = []
    for driver_id in contenders:
        values = []
        for number in events:
            rows = cuts.get(number, [])
            match = next((row for row in rows if row.driver_id == driver_id), None)
            values.append(match.gap_to_leader if match else None)
        gap_series.append({"driver_id": driver_id, "values": values})
    return {"evolution": {"rises": rises, "falls": falls}, "gap_to_leader": {"series": gap_series}}


def _heatmap(by_driver: dict, events: list[int], cuts: dict[int, list[StandingRow]] | None) -> dict:
    order = [row.driver_id for row in cuts[events[-1]]] if cuts and events and events[-1] in cuts else []
    order += [d for d in by_driver if d not in order]
    rows = []
    for d in order:
        cells = []
        for number in events:
            positions = [r.position for r in by_driver.get(d, []) if r.event_number == number and r.position]
            cells.append(min(positions) if positions else None)
        if any(c is not None for c in cells):
            rows.append({"driver_id": d, "positions": cells})
    return {"events": events, "rows": rows}
