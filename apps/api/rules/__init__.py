"""Regras do campeonato RKR em Python puro (sem Django).

Tudo aqui recebe dados simples e devolve dados simples, para ser testado isoladamente.
O frontend nunca recalcula nada disso: apenas exibe o que a API devolve.
"""

from .discard import Absence, apply_discards, find_absences
from .scoring import ScoringConfig, race_points
from .standings import StandingRow, compute_standings, standings_by_event
from .types import DNF, DNS, DSQ, FIN, STATUSES, ScoredResult

__all__ = [
    "Absence",
    "find_absences",
    "DNF",
    "DNS",
    "DSQ",
    "FIN",
    "STATUSES",
    "ScoredResult",
    "ScoringConfig",
    "StandingRow",
    "apply_discards",
    "compute_standings",
    "race_points",
    "standings_by_event",
]
