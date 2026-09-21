from dataclasses import dataclass

FIN = "FIN"
DNF = "DNF"
DSQ = "DSQ"
DNS = "DNS"
STATUSES = (FIN, DNF, DSQ, DNS)


@dataclass(frozen=True)
class ScoredResult:
    """Resultado de um piloto em uma corrida, já pontuado.

    `sequence` ordena as corridas dentro da temporada (etapa e ordem da corrida),
    e `event_number` agrupa as corridas por etapa.
    """

    result_id: int | str
    driver_id: int | str
    event_number: int
    sequence: int
    race_label: str
    position: int | None
    status: str
    points: float
    pole: bool = False
    fastest_lap: bool = False
    penalties: int = 0
    penalty_seconds: float = 0
    start_position: int | None = None
    best_lap_ms: int | None = None

    @property
    def participated(self) -> bool:
        return self.status != DNS

    @property
    def finished(self) -> bool:
        return self.status == FIN
