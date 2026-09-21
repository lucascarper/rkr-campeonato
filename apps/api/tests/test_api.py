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
