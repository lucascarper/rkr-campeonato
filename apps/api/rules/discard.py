from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from .types import ScoredResult


@dataclass(frozen=True)
class Absence:
    """Corrida da categoria que o piloto não disputou: vale 0 ponto e pode ser descartada."""

    event_number: int
    index: int  # 1, 2… quando o piloto falta a mais de uma corrida da mesma etapa

    @property
    def result_id(self) -> str:
        return f"ausencia:{self.event_number}:{self.index}"

    @property
    def sequence(self) -> int:
        return self.event_number * 100 + 99 - self.index  # depois das corridas disputadas da etapa

    points = 0.0


def find_absences(
    results: Iterable[ScoredResult], slots: Mapping[int, int], upto: int | None = None
) -> list[Absence]:
    """Corridas da categoria (por etapa, em `slots`) sem resultado do piloto, até a etapa `upto`."""
    raced: dict[int, int] = {}
    for r in results:
        raced[r.event_number] = raced.get(r.event_number, 0) + 1
    absences = []
    for event, total in sorted(slots.items()):
        if upto is not None and event > upto:
            continue
        missing = total - raced.get(event, 0)
        absences.extend(Absence(event, i) for i in range(1, missing + 1))
    return absences


def apply_discards(
    results: Iterable[ScoredResult],
    discards: int,
    absences: Iterable[Absence] = (),
    discard_absences: bool = True,
) -> tuple[float, set]:
    """Soma os pontos descartando os `discards` piores resultados.

    Com `discard_absences` (padrão da RKR), as corridas que o piloto não disputou entram na escolha
    como 0 ponto, assim como os resultados DNS; sem isso, só corridas disputadas podem ser descartadas.
    Em empate de pontuação, descarta-se a corrida mais antiga.
    Devolve (pontos com descarte, ids descartados — ids de resultado ou "ausencia:<etapa>:<n>").
    """
    results = list(results)
    total = sum(r.points for r in results)
    if discards <= 0:
        return round(total, 2), set()
    if discard_absences:
        candidates: list = [*results, *absences]
    else:
        candidates = [r for r in results if r.participated]
    dropped = sorted(candidates, key=lambda r: (r.points, r.sequence))[:discards]
    return round(total - sum(r.points for r in dropped), 2), {r.result_id for r in dropped}
