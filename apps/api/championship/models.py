import unicodedata

from django.conf import settings
from django.db import models
from django.utils.text import slugify

from rules.standings import DEFAULT_TIEBREAK
from rules.types import STATUSES


def normalize_name(value: str) -> str:
    """Nome sem acentos, aspas, maiúsculas nem espaços repetidos (para achar duplicatas)."""
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = "".join(c if c.isalnum() or c.isspace() else " " for c in text.lower())
    return " ".join(text.split())


class Season(models.Model):
    year = models.PositiveIntegerField(unique=True)
    # Incrementado a cada recálculo; entra na chave do cache das rotas públicas.
    data_version = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-year"]

    def __str__(self) -> str:
        return str(self.year)


class Category(models.Model):
    code = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=60)
    display_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["display_order", "code"]
        verbose_name_plural = "categories"

    def __str__(self) -> str:
        return self.code


class Driver(models.Model):
    name = models.CharField(max_length=120)
    nickname = models.CharField(max_length=60, blank=True)
    slug = models.SlugField(max_length=140, unique=True)
    normalized_name = models.CharField(max_length=140, db_index=True, editable=False)
    # Categoria atual: define para qual classificação vão os pontos da pré-temporada.
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL)
    number = models.PositiveSmallIntegerField(null=True, blank=True)
    photo = models.CharField(max_length=255, blank=True, help_text="Caminho da versão grande no storage")
    photo_thumb = models.CharField(max_length=255, blank=True, help_text="Caminho da miniatura no storage")
    active = models.BooleanField(default=True)
    hidden = models.BooleanField(default=False, help_text="Oculta nome e foto no site público")
    merged_into = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        self.normalized_name = normalize_name(self.name)
        if not self.slug:
            base = slugify(self.name)[:120] or "piloto"
            slug, n = base, 2
            while Driver.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug, n = f"{base}-{n}", n + 1
            self.slug = slug
        super().save(*args, **kwargs)


class Event(models.Model):
    SCHEDULED, DONE, CANCELLED = "scheduled", "done", "cancelled"
    STATUS_CHOICES = [(SCHEDULED, "Agendada"), (DONE, "Realizada"), (CANCELLED, "Cancelada")]

    season = models.ForeignKey(Season, related_name="events", on_delete=models.CASCADE)
    number = models.PositiveSmallIntegerField()
    date = models.DateField(null=True, blank=True)
    location = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=SCHEDULED)
    is_preseason = models.BooleanField(default=False)

    # Reservados para a arte "Próxima etapa", guardada na branch feature/arte-proxima-etapa.
    # Ficam no banco (sem uso) para preservar o que já foi preenchido e facilitar a volta da funcionalidade.
    CLOCKWISE, COUNTERCLOCKWISE = "cw", "ccw"
    DIRECTION_CHOICES = [(CLOCKWISE, "Horário"), (COUNTERCLOCKWISE, "Anti-horário")]
    schedule = models.JSONField(default=dict, blank=True)
    track_direction = models.CharField(max_length=3, choices=DIRECTION_CHOICES, blank=True)
    track_image = models.CharField(max_length=255, blank=True, help_text="Traçado original enviado")
    track_art = models.CharField(max_length=255, blank=True, help_text="Traçado redesenhado para as artes")

    class Meta:
        ordering = ["season", "number"]
        constraints = [models.UniqueConstraint(fields=["season", "number"], name="uniq_event_number")]

    def __str__(self) -> str:
        return f"{self.season} · Etapa {self.number}"


class ScoringTable(models.Model):
    """Tabela de pontos por posição. Uma temporada pode ter várias (ex.: Padrão e Endurance)."""

    season = models.ForeignKey(Season, related_name="scoring_tables", on_delete=models.CASCADE)
    name = models.CharField(max_length=60)
    is_default = models.BooleanField(default=False)

    class Meta:
        ordering = ["-is_default", "name"]
        constraints = [models.UniqueConstraint(fields=["season", "name"], name="uniq_table_name")]

    def __str__(self) -> str:
        return f"{self.season} · {self.name}"

    def as_dict(self) -> dict[int, float]:
        return {rule.position: float(rule.points) for rule in self.rules.all()}


class ScoringRule(models.Model):
    table = models.ForeignKey(ScoringTable, related_name="rules", on_delete=models.CASCADE)
    position = models.PositiveSmallIntegerField()
    points = models.DecimalField(max_digits=6, decimal_places=2)

    class Meta:
        ordering = ["table", "position"]
        constraints = [models.UniqueConstraint(fields=["table", "position"], name="uniq_rule_position")]

    def __str__(self) -> str:
        return f"{self.position}º = {self.points}"


def default_tiebreak():
    return list(DEFAULT_TIEBREAK)


class SeasonConfig(models.Model):
    season = models.OneToOneField(Season, related_name="config", on_delete=models.CASCADE)
    discards = models.PositiveSmallIntegerField(default=2)
    discard_absences = models.BooleanField(
        default=True, help_text="Corridas que o piloto não disputou também podem ser descartadas (valem 0)"
    )
    consistency_top_n = models.PositiveSmallIntegerField(default=5)
    podium_positions = models.PositiveSmallIntegerField(
        default=5, help_text="Quantos primeiros colocados contam como pódio (RKR: até o 5º)"
    )
    tiebreak_order = models.JSONField(default=default_tiebreak)
    pole_bonus = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    fastest_lap_bonus = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    fastest_lap_min_position = models.PositiveSmallIntegerField(
        default=1, help_text="Bônus de VR só para quem termina nesta posição ou pior (4 = fora do pódio)"
    )
    dnf_points = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    shirt_penalty = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    def __str__(self) -> str:
        return f"Configuração {self.season}"


class Race(models.Model):
    event = models.ForeignKey(Event, related_name="races", on_delete=models.CASCADE)
    order = models.PositiveSmallIntegerField(default=1)
    label = models.CharField(max_length=40, help_text="Bateria A, Final…")
    # Nulo nas baterias de pré-temporada, que misturam pilotos de todas as categorias.
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.PROTECT)
    scoring_table = models.ForeignKey(ScoringTable, null=True, blank=True, on_delete=models.SET_NULL)
    start_time = models.TimeField(null=True, blank=True)

    class Meta:
        ordering = ["event__number", "order"]
        constraints = [
            models.UniqueConstraint(fields=["event", "label", "category"], name="uniq_race_key"),
        ]

    def __str__(self) -> str:
        return f"{self.event} · {self.label}"


class ImportBatch(models.Model):
    PREVIEW, CONFIRMED, UNDONE, DISCARDED = "preview", "confirmed", "undone", "discarded"
    STATUS_CHOICES = [
        (PREVIEW, "Pré-visualização"),
        (CONFIRMED, "Confirmada"),
        (UNDONE, "Desfeita"),
        (DISCARDED, "Descartada"),
    ]

    file = models.FileField(upload_to="imports/%Y/%m/", blank=True)
    filename = models.CharField(max_length=255)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=PREVIEW)
    rows = models.PositiveIntegerField(default=0)
    rows_written = models.PositiveIntegerField(default=0)
    payload = models.JSONField(default=dict, help_text="Dados lidos da planilha, gravados na confirmação")
    report = models.JSONField(default=dict, help_text="Erros, avisos e resumo da pré-visualização")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.filename} ({self.get_status_display()})"


class RaceResult(models.Model):
    STATUS_CHOICES = [(s, s) for s in STATUSES]

    race = models.ForeignKey(Race, related_name="results", on_delete=models.CASCADE)
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.PROTECT)
    driver = models.ForeignKey(Driver, related_name="results", on_delete=models.PROTECT)
    position = models.PositiveSmallIntegerField(null=True, blank=True)
    start_position = models.PositiveSmallIntegerField(null=True, blank=True)
    best_lap_ms = models.PositiveIntegerField(null=True, blank=True)
    laps = models.PositiveSmallIntegerField(null=True, blank=True)
    status = models.CharField(max_length=3, choices=STATUS_CHOICES, default="FIN")
    pole = models.BooleanField(default=False)
    fastest_lap = models.BooleanField(default=False)
    shirt_penalty = models.BooleanField(default=False)
    points = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    sheet_points = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    notes = models.CharField(max_length=200, blank=True)
    import_batch = models.ForeignKey(
        ImportBatch, null=True, blank=True, related_name="results", on_delete=models.SET_NULL
    )
    # Reenvio da mesma corrida: o resultado antigo fica inativo e volta se a importação for desfeita.
    active = models.BooleanField(default=True)
    replaced_by = models.ForeignKey(
        ImportBatch, null=True, blank=True, related_name="replaced_results", on_delete=models.SET_NULL
    )

    class Meta:
        ordering = ["race", "position"]
        indexes = [
            models.Index(fields=["category", "driver"]),
            models.Index(fields=["race", "category", "position"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["race", "driver"], condition=models.Q(active=True), name="uniq_active_result"
            )
        ]

    def __str__(self) -> str:
        return f"{self.race} · {self.position} · {self.driver}"


class Penalty(models.Model):
    TIME, POSITION, DSQ, STOP_GO, OTHER = "time", "position", "dsq", "stop_go", "other"
    KIND_CHOICES = [
        (TIME, "Tempo"),
        (POSITION, "Posição"),
        (DSQ, "Desclassificação"),
        (STOP_GO, "Stop & Go"),
        (OTHER, "Outra"),
    ]

    result = models.ForeignKey(RaceResult, related_name="penalty_set", on_delete=models.CASCADE)
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    seconds = models.DecimalField(max_digits=6, decimal_places=1, default=0)
    positions = models.PositiveSmallIntegerField(default=0)
    reason = models.CharField(max_length=200, blank=True)

    def __str__(self) -> str:
        return f"{self.get_kind_display()} {self.reason}".strip()


class Standing(models.Model):
    """Classificação calculada após cada etapa (recalculada a cada importação)."""

    season = models.ForeignKey(Season, on_delete=models.CASCADE)
    category = models.ForeignKey(Category, on_delete=models.CASCADE)
    upto_event = models.PositiveSmallIntegerField()
    driver = models.ForeignKey(Driver, on_delete=models.CASCADE)
    position = models.PositiveSmallIntegerField()
    previous_position = models.PositiveSmallIntegerField(null=True, blank=True)
    points = models.DecimalField(max_digits=8, decimal_places=2)
    points_with_discard = models.DecimalField(max_digits=8, decimal_places=2)
    races = models.PositiveSmallIntegerField(default=0)
    wins = models.PositiveSmallIntegerField(default=0)
    podiums = models.PositiveSmallIntegerField(default=0)
    poles = models.PositiveSmallIntegerField(default=0)
    fastest_laps = models.PositiveSmallIntegerField(default=0)
    gap_to_leader = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    per_event = models.JSONField(default=dict)

    class Meta:
        ordering = ["season", "category", "upto_event", "position"]
        indexes = [models.Index(fields=["season", "category", "upto_event"])]

    def __str__(self) -> str:
        return f"{self.category} até E{self.upto_event}: {self.position}º {self.driver}"
