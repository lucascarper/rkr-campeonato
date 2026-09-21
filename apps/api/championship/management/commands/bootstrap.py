"""Carga inicial idempotente: temporada, regras da RKR e usuário administrador.

Uso: python manage.py bootstrap [--year 2026]
O administrador é criado a partir de DJANGO_SUPERUSER_USERNAME / DJANGO_SUPERUSER_PASSWORD, se definidas.
"""

import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from championship.models import ScoringRule, ScoringTable, Season, SeasonConfig

# Regras do regulamento RKR 2026 (conferidas com a planilha oficial até a Etapa 8).
RKR_TABLES = {
    "Padrão": [25, 20, 18, 15, 12, 10, 8, 6, 4, 3, 2, 1],
    "Endurance": [35, 30, 25, 20, 18, 15, 12, 10, 8, 6, 5, 4, 3],
}
RKR_CONFIG = {
    "discards": 2,
    "discard_absences": True,  # faltas também podem ser descartadas (confirmado com a organização)
    "consistency_top_n": 5,
    "podium_positions": 5,  # pódio da RKR: do 1º ao 5º
    "tiebreak_order": ["countback", "poles", "fastest_laps"],
    "pole_bonus": 1,
    "fastest_lap_bonus": 2,
    "fastest_lap_min_position": 4,
    "dnf_points": 0,
    "shirt_penalty": 1,
}


class Command(BaseCommand):
    help = "Cria a temporada com as regras da RKR (se ainda não existir) e o administrador."

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, default=2026)

    def handle(self, *args, year, **options):
        season, created = Season.objects.get_or_create(year=year)
        config, config_created = SeasonConfig.objects.get_or_create(season=season, defaults=RKR_CONFIG)
        if not season.scoring_tables.exists():
            for name, points in RKR_TABLES.items():
                table = ScoringTable.objects.create(season=season, name=name, is_default=name == "Padrão")
                ScoringRule.objects.bulk_create(
                    ScoringRule(table=table, position=i, points=p) for i, p in enumerate(points, start=1)
                )
            self.stdout.write(f"Tabelas de pontos criadas para {year}.")
        if created or config_created:
            self.stdout.write(f"Temporada {year} configurada.")

        username = os.environ.get("DJANGO_SUPERUSER_USERNAME")
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD")
        if username and password:
            User = get_user_model()
            if not User.objects.filter(username=username).exists():
                User.objects.create_superuser(
                    username=username, password=password, email=os.environ.get("DJANGO_SUPERUSER_EMAIL", "")
                )
                self.stdout.write(f"Administrador {username} criado.")
        self.stdout.write(self.style.SUCCESS("Bootstrap concluído."))
