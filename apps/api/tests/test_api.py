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
    # Ed Júnior correu 6 das 8 etapas: os 2 descartes caem nas faltas (E1 e E5) e ele não perde pontos.
    data = client.get("/api/drivers/ed-junior/").json()
    assert data["category"] == "RK2" and data["rank"] == 1 and data["discard_absences"] is True
    assert [a["event"] for a in data["absences"]] == [1, 5]
    assert all(a["discarded"] for a in data["absences"])
    assert data["series"]["discarded_events"] == [1, 5]
    assert data["stats"]["points_with_discard"] == data["stats"]["points"] == 128
    assert data["series"]["with_discard"][-1] == 128
    assert not any(r["discarded"] for r in data["races"])


def test_discard_without_absences_rule(client, imported, season):
    from championship.services import recalculate

    season.config.discard_absences = False
    season.config.save()
    recalculate(season)
    data = client.get("/api/drivers/ed-junior/").json()
    assert data["stats"]["points_with_discard"] == 108  # regra antiga: descarta 1 e 19 pontos
    assert sum(1 for r in data["races"] if r["discarded"]) == 2
    assert not any(a["discarded"] for a in data["absences"])


def test_standing_with_discard_counts_absences(imported):
    from championship.models import Standing

    row = Standing.objects.get(category__code="RK2", upto_event=8, driver__slug="ed-junior")
    assert float(row.points_with_discard) == 128


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


def test_podium_counts_top_five(client, imported):
    """Pódio da RKR vai até o 5º: a contagem da tabela e da janela do piloto usa o top 5."""
    rows = client.get("/api/standings/?category=RK1").json()["rows"]
    checked = 0
    for row in rows[:10]:
        profile = client.get(f"/api/drivers/{row['driver']['slug']}/?category=RK1").json()
        positions = [r["position"] for r in profile["races"] if r["position"]]
        top5 = sum(1 for p in positions if p <= 5)
        assert row["podiums"] == profile["stats"]["podiums"] == top5
        checked += top5 > sum(1 for p in positions if p <= 3)
    assert checked  # ao menos um piloto com 4º ou 5º lugar, onde a regra faz diferença


def test_podium_endpoint(client, imported):
    data = client.get("/api/podium/?category=RK1&event=8").json()
    assert data["event"]["number"] == 8 and data["race"] == {"label": "Final", "preseason": False}
    assert [r["position"] for r in data["rows"]] == [1, 2, 3, 4, 5]
    assert data["rows"][0]["driver"]["name"] == "Bárbara Louly"
    assert [e["number"] for e in data["events"]] == [1, 2, 3, 4, 5, 6, 7, 8]
    # Pré-temporada: pódio por bateria
    heat = client.get("/api/podium/?category=RK2&event=1&race=Bateria B").json()
    assert heat["race"] == {"label": "Bateria B", "preseason": True}
    assert heat["rows"][0]["driver"]["name"] == "Marcelo Albuquerque"
    # Etapa inexistente: usa a última com resultado
    assert client.get("/api/podium/?category=RK1&event=99").json()["event"]["number"] == 8


def test_podium_excludes_disqualified(client, imported):
    # E7 RK1: DSQ na 16ª posição nunca entra no pódio; aqui só conferimos que os 5 terminaram.
    rows = client.get("/api/podium/?category=RK1&event=7").json()["rows"]
    assert len(rows) == 5 and all(r["position"] <= 5 for r in rows)


def test_photo_jpeg_for_art(admin_client, client, imported, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    buffer = io.BytesIO()
    Image.new("RGB", (600, 800), "green").save(buffer, "JPEG")
    buffer.name = "foto.jpg"
    buffer.seek(0)
    driver = Driver.objects.get(slug="barbara-louly")
    admin_client.post(f"/api/admin/drivers/{driver.id}/photo/", {"photo": buffer})
    cache.clear()
    art = client.get("/api/podium/?category=RK1&event=8").json()["rows"][0]["driver"]["photo_art"]
    assert art.endswith("-lg.webp?format=jpeg")
    response = client.get(art)
    assert response.status_code == 200 and response["Content-Type"] == "image/jpeg"
    with Image.open(io.BytesIO(response.content)) as img:
        assert img.format == "JPEG" and img.size == (900, 1200)
