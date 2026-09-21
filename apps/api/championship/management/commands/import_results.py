"""Importa uma planilha pela linha de comando (útil na carga inicial).

Uso: python manage.py import_results caminho/planilha.xlsx [--link-suggestions]
"""

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from imports import service


class Command(BaseCommand):
    help = "Importa uma planilha de resultados (pré-visualiza, mostra erros e confirma)."

    def add_arguments(self, parser):
        parser.add_argument("path")
        parser.add_argument("--dry-run", action="store_true", help="Só pré-visualiza.")
        parser.add_argument(
            "--link-suggestions",
            action="store_true",
            help="Vincula nomes parecidos ao cadastro sugerido (senão cria pilotos novos).",
        )

    def handle(self, *args, path, dry_run, link_suggestions, **options):
        file = Path(path)
        if not file.exists():
            raise CommandError(f"Arquivo não encontrado: {file}")
        batch = service.preview(file.name, file.read_bytes(), None)
        report = batch.report
        for issue in report["issues"]:
            where = " ".join(str(x) for x in (issue.get("sheet"), issue.get("line")) if x)
            self.stdout.write(f"[{issue['level']}] {where} {issue['message']}")
        self.stdout.write(
            f"Corridas novas: {report['summary']['new']} · substituídas: {report['summary']['replace']} · "
            f"sem alteração: {report['summary']['unchanged']} · pilotos: {len(report['drivers'])} · "
            f"conferência com a planilha: {report['official_check']['checked']} totais, "
            f"{report['official_check']['mismatches']} divergências"
        )
        if report["errors"]:
            raise CommandError(f"{report['errors']} erro(s) bloqueante(s). Nada foi gravado.")
        if dry_run:
            service.undo(batch)
            return
        choices = {}
        for driver in report["drivers"]:
            if driver["status"] == "suggestion":
                best = driver["suggestions"][0]
                choices[driver["name"]] = (
                    {"action": "link", "driver_id": best["id"]} if link_suggestions else {"action": "create"}
                )
        result = service.confirm(batch, choices)
        self.stdout.write(self.style.SUCCESS(f"Importação #{batch.id} gravada: {result}"))
