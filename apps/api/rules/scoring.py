from collections.abc import Mapping
from dataclasses import dataclass

from .types import DNF, DNS, DSQ


@dataclass(frozen=True)
class ScoringConfig:
    """Bônus e descontos da temporada. Todos com padrão 0 (ver SeasonConfig)."""

    pole_bonus: float = 0
    fastest_lap_bonus: float = 0
    # O bônus de volta mais rápida só vale para quem termina nesta posição ou pior
    # (RKR: 4, ou seja, fora do pódio). 1 = vale para todos.
    fastest_lap_min_position: int = 1
    dnf_points: float = 0
    shirt_penalty: float = 0


def race_points(
    *,
    position: int | None,
    status: str,
    table: Mapping[int, float],
    config: ScoringConfig,
    pole: bool = False,
    fastest_lap: bool = False,
    shirt_penalty: bool = False,
) -> float:
    """Pontos de um resultado: tabela da posição + bônus − descontos.

    DSQ e DNS recebem 0 (sem bônus). DNF recebe `dnf_points` no lugar da tabela.
    O desconto de camiseta vale em qualquer situação.
    """
    points = 0.0
    if status in (DSQ, DNS):
        points = 0.0
    else:
        if status == DNF:
            points += float(config.dnf_points)
        elif position is not None:
            points += float(table.get(position, 0))
        if pole:
            points += float(config.pole_bonus)
        if fastest_lap and position is not None and position >= config.fastest_lap_min_position:
            points += float(config.fastest_lap_bonus)
    if shirt_penalty:
        points -= float(config.shirt_penalty)
    return round(points, 2)
