from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field

from .types import ScoredResult

# Critérios de desempate disponíveis. A ordem usada vem de SeasonConfig.tiebreak_order.
TIEBREAKERS = {
    "countback": "Mais vitórias, depois mais 2º lugares, 3º lugares e assim por diante",
    "wins": "Mais vitórias",
    "last_event": "Melhor posição na última etapa disputada",
    "poles": "Mais poles",
    "fastest_laps": "Mais voltas mais rápidas",
}
DEFAULT_TIEBREAK = ["countback", "poles", "fastest_laps"]

_ABSENT = 10_000


@dataclass
class StandingRow:
    driver_id: int | str
    position: int = 0
    points: float = 0
    races: int = 0
    wins: int = 0
    podiums: int = 0
    poles: int = 0
    fastest_laps: int = 0
    per_event: dict[int, float] = field(default_factory=dict)
    gap_to_leader: float = 0
    previous_position: int | None = None

    @property
    def delta(self) -> int | None:
        """Positivo = subiu posições em relação à etapa anterior."""
        if self.previous_position is None:
            return None
        return self.previous_position - self.position


def _tiebreak_key(
    criteria: Sequence[str],
    results: list[ScoredResult],
    max_position: int,
    last_event: int | None,
) -> tuple:
    key: list = []
    for criterion in criteria:
        if criterion == "countback":
            counts = [0] * max_position
            for r in results:
                if r.position:
                    counts[r.position - 1] += 1
            key.extend(-c for c in counts)
        elif criterion == "wins":
            key.append(-sum(1 for r in results if r.position == 1))
        elif criterion == "poles":
            key.append(-sum(1 for r in results if r.pole))
        elif criterion == "fastest_laps":
            key.append(-sum(1 for r in results if r.fastest_lap))
        elif criterion == "last_event":
            positions = [r.position for r in results if r.event_number == last_event and r.position]
            key.append(min(positions) if positions else _ABSENT)
        else:
            raise ValueError(f"Critério de desempate desconhecido: {criterion}")
    return tuple(key)


def compute_standings(
    results: Iterable[ScoredResult],
    drivers: Iterable[int | str] = (),
    tiebreak: Sequence[str] = DEFAULT_TIEBREAK,
    upto: int | None = None,
) -> list[StandingRow]:
    """Classificação sem descarte: soma de todos os pontos até a etapa `upto` (inclusive).

    `drivers` inclui pilotos da categoria mesmo sem resultado no corte (ficam com 0).
    Pilotos empatados em todos os critérios recebem a mesma posição (1, 2, 2, 4).
    """
    results = [r for r in results if upto is None or r.event_number <= upto]
    by_driver: dict[int | str, list[ScoredResult]] = defaultdict(list)
    for d in drivers:
        by_driver.setdefault(d, [])
    for r in results:
        by_driver[r.driver_id].append(r)

    max_position = max((r.position or 0 for r in results), default=0) or 1
    last_event = max((r.event_number for r in results), default=None)

    rows: list[tuple[tuple, StandingRow]] = []
    for driver_id, driver_results in by_driver.items():
        row = StandingRow(driver_id=driver_id)
        for r in driver_results:
            row.points += r.points
            row.per_event[r.event_number] = round(row.per_event.get(r.event_number, 0) + r.points, 2)
            if r.participated:
                row.races += 1
            if r.position == 1:
                row.wins += 1
            if r.position and r.position <= 3:
                row.podiums += 1
            row.poles += int(r.pole)
            row.fastest_laps += int(r.fastest_lap)
        row.points = round(row.points, 2)
        key = (-row.points, *_tiebreak_key(tiebreak, driver_results, max_position, last_event))
        rows.append((key, row))

    rows.sort(key=lambda kr: (kr[0], str(kr[1].driver_id)))
    ordered: list[StandingRow] = []
    previous_key = None
    for index, (key, row) in enumerate(rows, start=1):
        row.position = ordered[-1].position if key == previous_key else index
        previous_key = key
        ordered.append(row)

    leader_points = ordered[0].points if ordered else 0
    for row in ordered:
        row.gap_to_leader = round(leader_points - row.points, 2)
    return ordered


def standings_by_event(
    results: Iterable[ScoredResult],
    drivers: Iterable[int | str] = (),
    tiebreak: Sequence[str] = DEFAULT_TIEBREAK,
    event_numbers: Iterable[int] | None = None,
) -> dict[int, list[StandingRow]]:
    """Classificação após cada etapa, com a variação de posição em relação à etapa anterior."""
    results = list(results)
    drivers = list(drivers)
    if event_numbers is None:
        event_numbers = {r.event_number for r in results}
    cuts: dict[int, list[StandingRow]] = {}
    previous: dict[int | str, int] = {}
    numbers = sorted(event_numbers)
    for number in numbers:
        # Nos cortes intermediários só aparece quem já tinha corrido; no último, todos os inscritos.
        registered = drivers if number == numbers[-1] else ()
        rows = compute_standings(results, registered, tiebreak, upto=number)
        for row in rows:
            row.previous_position = previous.get(row.driver_id)
        previous = {row.driver_id: row.position for row in rows}
        cuts[number] = rows
    return cuts
