"""Etapa de release do deploy: migra o banco e aplica a carga inicial.

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
        self.stdout.write(self.style.SUCCESS("Release concluído."))
