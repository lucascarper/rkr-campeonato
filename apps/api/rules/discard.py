from collections.abc import Iterable

from .types import ScoredResult


def apply_discards(results: Iterable[ScoredResult], discards: int) -> tuple[float, set]:
    """Soma os pontos descartando os `discards` piores resultados.

    Só entram na escolha corridas em que o piloto participou (ausência não é resultado).
    Em empate de pontuação, descarta-se a corrida mais antiga.
    Devolve (pontos com descarte, ids dos resultados descartados).
    """
    results = list(results)
    total = sum(r.points for r in results)
    if discards <= 0:
        return round(total, 2), set()
    candidates = sorted((r for r in results if r.participated), key=lambda r: (r.points, r.sequence))
    dropped = candidates[:discards]
    discarded_ids = {r.result_id for r in dropped}
    return round(total - sum(r.points for r in dropped), 2), discarded_ids
