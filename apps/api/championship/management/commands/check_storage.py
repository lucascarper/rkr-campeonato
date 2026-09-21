"""Testa o armazenamento de arquivos (bucket S3 ou disco): grava, lê, gera a URL pública e apaga.

Uso: python manage.py check_storage
"""

import uuid

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Verifica se a api consegue gravar e ler no storage configurado (S3_* ou MEDIA_ROOT)."

    def handle(self, *args, **options):
        if settings.S3_BUCKET:
            endpoint = settings.STORAGES["default"]["OPTIONS"].get("endpoint_url") or "(AWS padrão)"
            self.stdout.write(f"Storage: bucket S3 '{settings.S3_BUCKET}' · endpoint {endpoint}")
            if endpoint == "(AWS padrão)":
                self.stdout.write(
                    self.style.WARNING(
                        "S3_ENDPOINT vazio: as chaves serão enviadas à AWS. Buckets da Railway "
                        "e de outros provedores precisam do endpoint."
                    )
                )
        else:
            self.stdout.write(f"Storage: disco local em {settings.MEDIA_ROOT}")
        name = f"healthcheck/{uuid.uuid4().hex}.txt"
        try:
            saved = default_storage.save(name, ContentFile(b"rkr"))
            with default_storage.open(saved) as fh:
                assert fh.read() == b"rkr"
            url = default_storage.url(saved)
            default_storage.delete(saved)
        except Exception as exc:
            raise CommandError(f"Falhou: {type(exc).__name__}: {exc}") from exc
        self.stdout.write(self.style.SUCCESS(f"OK: gravou, leu e apagou {saved}. URL pública seria: {url}"))
