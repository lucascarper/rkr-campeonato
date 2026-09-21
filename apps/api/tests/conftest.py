from pathlib import Path

import pytest
from django.core.management import call_command

WORKBOOK = Path(__file__).resolve().parents[3] / "docs" / "exemplos" / "rkr-2026-etapa-8.xlsx"


@pytest.fixture
def season(db):
    call_command("bootstrap", verbosity=0)
    from championship.models import Season

    return Season.objects.get(year=2026)


@pytest.fixture
def imported(season):
    from imports import service

    batch = service.preview(WORKBOOK.name, WORKBOOK.read_bytes(), None)
    assert batch.report["errors"] == 0, batch.report["issues"]
    service.confirm(batch, {})
    season.refresh_from_db()
    return batch


@pytest.fixture
def admin_client(client, django_user_model):
    user = django_user_model.objects.create_user("admin", password="senha-forte-123!", is_staff=True)
    client.force_login(user)
    return client


@pytest.fixture(autouse=True)
def isolated_media(settings, tmp_path):
    """Planilhas e fotos gravadas nos testes vão para uma pasta temporária."""
    # O storage do Django escuta a troca de MEDIA_ROOT e passa a gravar na nova pasta.
    settings.MEDIA_ROOT = tmp_path / "media"
