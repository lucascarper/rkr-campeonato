"""Etapa de release do deploy: migra o banco, aplica a carga inicial e recalcula as classificações.

Uso (pré-deploy na Railway): python manage.py release
Um único comando, sem depender de shell para encadear "migrate && bootstrap".
"""

from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Aplica as migrações e roda o bootstrap (temporada, regras e administrador)."

    def handle(self, *args, **options):
        call_command("migrate", interactive=False, verbosity=1)
        call_command("bootstrap")
        # Mudanças de regra no código (ex.: descarte de faltas) passam a valer já neste deploy.
        from championship.models import Season
        from championship.services import recalculate

        for season in Season.objects.all():
            summary = recalculate(season)
            self.stdout.write(f"Temporada {season.year} recalculada: {summary['results']} resultados.")
        self.stdout.write(self.style.SUCCESS("Release concluído."))
