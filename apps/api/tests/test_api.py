import io

from django.core.cache import cache
from PIL import Image

from championship.models import Driver


def test_public_endpoints(client, imported):
    assert client.get("/api/health/").json() == {"status": "ok"}
    data = client.get("/api/standings/?category=RK2").json()
    assert data["upto"] == 8 and data["cuts"] == [1, 2, 3, 4, 5, 6, 7, 8]
    assert data["rows"][0]["driver"]["name"] == "Ed Júnior"
    earlier = client.get("/api/standings/?category=RK2&upto=5").json()
    assert earlier["upto"] == 5 and len(earlier["events"]) == 5
    board = client.get("/api/dashboard/?category=RK1&from=4&to=8").json()
    assert board["range"] == {"from": 4, "to": 8}
    assert set(board["indicators"]) == {"fastest_laps", "wins", "consistency", "penalties"}
    assert board["extras"]["avg_gain"] is None  # a planilha não traz largada


def test_driver_profile_with_discards(client, imported):
    data = client.get("/api/drivers/ed-junior/").json()
    assert data["category"] == "RK2" and data["rank"] == 1
    assert len(data["series"]["discarded_races"]) == 2
    assert data["series"]["with_discard"][-1] == data["stats"]["points_with_discard"]
    assert data["series"]["no_discard"][-1] == data["stats"]["points"] == 128
    assert sum(1 for r in data["races"] if r["discarded"]) == 2


def test_hidden_driver(client, imported):
    Driver.objects.filter(slug="ed-junior").update(hidden=True)
    cache.clear()
    assert client.get("/api/drivers/ed-junior/").status_code == 404


def test_admin_requires_login(client, season):
    assert client.get("/api/admin/imports/").status_code == 403
    assert client.get("/api/admin/rules/").status_code == 403


def test_login_rate_limit(client, django_user_model, settings):
    settings.LOGIN_MAX_ATTEMPTS = 2
    cache.clear()
    django_user_model.objects.create_user("adm", password="certa-123456!", is_staff=True)
    for _ in range(2):
        assert client.post("/api/admin/login/", {"username": "adm", "password": "x"}).status_code == 400
    assert (
        client.post("/api/admin/login/", {"username": "adm", "password": "certa-123456!"}).status_code == 429
    )


def test_rules_update_recalculates(admin_client, imported):
    rules = admin_client.get("/api/admin/rules/").json()
    rules["pole_bonus"] = 0
    response = admin_client.put("/api/admin/rules/", rules, content_type="application/json")
    assert response.status_code == 200, response.content
    leader = admin_client.get("/api/standings/?category=RK2").json()["rows"][0]
    assert leader["points"] == 124  # Ed Júnior perde os 4 pontos de pole


def test_upload_flow(admin_client, season):
    from .conftest import WORKBOOK

    with open(WORKBOOK, "rb") as fh:
        preview = admin_client.post("/api/admin/imports/preview/", {"file": fh}).json()
    assert preview["report"]["errors"] == 0
    confirmed = admin_client.post(
        f"/api/admin/imports/{preview['id']}/confirm/", {}, content_type="application/json"
    )
    assert confirmed.json()["status"] == "confirmed"
    assert len(admin_client.get("/api/admin/imports/").json()) == 1


def test_photo_upload(admin_client, imported, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    buffer = io.BytesIO()
    Image.new("RGB", (1200, 900), "red").save(buffer, "JPEG")
    buffer.name = "foto.jpg"
    buffer.seek(0)
    driver = Driver.objects.get(slug="ed-junior")
    response = admin_client.post(f"/api/admin/drivers/{driver.id}/photo/", {"photo": buffer})
    assert response.status_code == 200, response.content
    driver.refresh_from_db()
    assert driver.photo.endswith("-lg.webp") and driver.photo_thumb.endswith("-thumb.webp")
    with Image.open(tmp_path / driver.photo_thumb) as thumb:
        assert thumb.size == (160, 160)


def test_photo_rejects_other_formats(admin_client, imported):
    fake = io.BytesIO(b"GIF89a....")
    fake.name = "x.gif"
    driver = Driver.objects.first()
    assert admin_client.post(f"/api/admin/drivers/{driver.id}/photo/", {"photo": fake}).status_code == 400


def test_login_through_proxy_with_public_domain(client, django_user_model, settings):
    """O Next repassa /api com X-Forwarded-Host = domínio público; basta ele estar em CSRF_TRUSTED_ORIGINS."""
    import importlib

    import config.settings as project_settings

    cache.clear()
    django_user_model.objects.create_user("adm", password="certa-123456!", is_staff=True)
    headers = {"HTTP_X_FORWARDED_HOST": "rkr-web.up.railway.app", "HTTP_HOST": "rkr-api.railway.internal"}
    settings.ALLOWED_HOSTS = [".railway.internal"]
    assert client.get("/api/admin/session/", **headers).status_code == 400  # domínio público não autorizado

    import os

    os.environ["CSRF_TRUSTED_ORIGINS"] = "rkr-web.up.railway.app"
    try:
        reloaded = importlib.reload(project_settings)
        settings.ALLOWED_HOSTS = reloaded.ALLOWED_HOSTS
        settings.CSRF_TRUSTED_ORIGINS = reloaded.CSRF_TRUSTED_ORIGINS
    finally:
        del os.environ["CSRF_TRUSTED_ORIGINS"]
        importlib.reload(project_settings)
    assert "rkr-web.up.railway.app" in settings.ALLOWED_HOSTS
    response = client.post("/api/admin/login/", {"username": "adm", "password": "certa-123456!"}, **headers)
    assert response.status_code == 200, response.content


def test_release_is_idempotent(db, monkeypatch):
    from django.core.management import call_command

    from championship.models import ScoringTable

    monkeypatch.setenv("DJANGO_SUPERUSER_USERNAME", "org")
    monkeypatch.setenv("DJANGO_SUPERUSER_PASSWORD", "senha-forte-123!")
    call_command("release", verbosity=0)
    call_command("release", verbosity=0)
    from django.contrib.auth import get_user_model

    assert get_user_model().objects.filter(username="org", is_staff=True).count() == 1
    assert ScoringTable.objects.count() == 2


def test_photo_storage_failure_returns_clear_error(admin_client, imported, monkeypatch):
    from championship import photos

    def broken_save(*args, **kwargs):
        raise RuntimeError("InvalidAccessKeyId")

    monkeypatch.setattr(photos.default_storage, "save", broken_save)
    buffer = io.BytesIO()
    Image.new("RGB", (300, 400), "red").save(buffer, "JPEG")
    buffer.name = "foto.jpg"
    buffer.seek(0)
    driver = Driver.objects.get(slug="ed-junior")
    response = admin_client.post(f"/api/admin/drivers/{driver.id}/photo/", {"photo": buffer})
    assert response.status_code == 502
    assert "S3_" in response.json()["detail"]


def test_check_storage_command(db, capsys):
    from django.core.management import call_command

    call_command("check_storage")
    assert "OK: gravou, leu e apagou" in capsys.readouterr().out


def test_private_domain_always_allowed(monkeypatch):
    """DJANGO_ALLOWED_HOSTS só com o domínio público não pode bloquear a rede privada da Railway."""
    import importlib

    import config.settings as project_settings

    monkeypatch.setenv("DJANGO_ALLOWED_HOSTS", "rkr-web.up.railway.app")
    monkeypatch.setenv("RAILWAY_PRIVATE_DOMAIN", "rkr-campeonato-api.railway.internal")
    try:
        reloaded = importlib.reload(project_settings)
        assert "rkr-campeonato-api.railway.internal" in reloaded.ALLOWED_HOSTS
        assert "healthcheck.railway.app" in reloaded.ALLOWED_HOSTS
        assert "rkr-web.up.railway.app" in reloaded.ALLOWED_HOSTS
    finally:
        monkeypatch.undo()
        importlib.reload(project_settings)


def test_internal_request_with_port(client, settings, imported):
    settings.ALLOWED_HOSTS = ["rkr-campeonato-api.railway.internal"]
    response = client.get(
        "/api/standings/?category=RK1", HTTP_HOST="rkr-campeonato-api.railway.internal:8000"
    )
    assert response.status_code == 200


def test_photo_served_through_api(admin_client, client, imported, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    settings.MEDIA_VIA_API = True
    buffer = io.BytesIO()
    Image.new("RGB", (600, 800), "blue").save(buffer, "JPEG")
    buffer.name = "foto.jpg"
    buffer.seek(0)
    driver = Driver.objects.get(slug="ed-junior")
    data = admin_client.post(f"/api/admin/drivers/{driver.id}/photo/", {"photo": buffer}).json()
    assert data["thumb_url"].startswith("/media/drivers/ed-junior/")
    cache.clear()
    public = client.get("/api/drivers/ed-junior/").json()["driver"]
    assert public["photo"].startswith("/media/drivers/ed-junior/") and public["photo"].endswith("-lg.webp")
    response = client.get(public["photo"])
    assert response.status_code == 200
    assert response["Content-Type"] == "image/webp"
    assert "immutable" in response["Cache-Control"]
    with Image.open(io.BytesIO(b"".join(response.streaming_content))) as img:
        assert img.size == (900, 1200)


def test_media_does_not_expose_spreadsheets(client, imported):
    assert client.get("/media/imports/2026/09/rkr-2026-etapa-8.xlsx").status_code == 404
    assert client.get("/media/drivers/../imports/x.xlsx").status_code == 404
    assert client.get("/media/drivers/nao-existe/abc-lg.webp").status_code == 404
