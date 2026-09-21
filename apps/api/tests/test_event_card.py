import io

from PIL import Image, ImageDraw

from championship.models import Event, Season
from championship.tracks import render_track_art, track_mask


def track_png(background, line, size=(800, 600)) -> io.BytesIO:
    img = Image.new("RGBA", size, background)
    ImageDraw.Draw(img).rounded_rectangle((100, 100, 700, 500), 120, outline=line, width=24)
    buffer = io.BytesIO()
    img.save(buffer, "PNG")
    buffer.name = "tracado.png"
    buffer.seek(0)
    return buffer


class TestTrackArt:
    def test_black_line_on_white(self):
        mask = track_mask(Image.open(track_png("white", "black")))
        assert mask.getpixel((100, 300)) > 200  # na linha
        assert mask.getpixel((400, 300)) == 0  # fundo

    def test_light_line_on_dark(self):
        mask = track_mask(Image.open(track_png((20, 20, 20, 255), "white")))
        assert mask.getpixel((100, 300)) > 200 and mask.getpixel((400, 300)) == 0

    def test_colored_line_on_transparent(self):
        mask = track_mask(Image.open(track_png((0, 0, 0, 0), (30, 90, 200, 255))))
        assert mask.getpixel((100, 300)) > 200 and mask.getpixel((400, 300)) == 0

    def test_art_is_white_line_with_red_glow(self):
        art = render_track_art(Image.open(track_png("white", "black")))
        assert art.mode == "RGBA"
        line = art.getpixel((60 + 12, art.height // 2))  # borda esquerda do traço, após recorte + margem
        assert line[:3] == (255, 255, 255) and line[3] > 200
        glow = art.getpixel((20, art.height // 2))
        assert glow[0] > glow[1] and glow[3] > 0  # vermelho translúcido fora do traço


def test_event_card_creates_future_event(admin_client, season):
    body = {
        "number": 9,
        "date": "2026-10-03",
        "location": "Kart Point",
        "schedule": {"practice": "13:00", "RK3": "13:45", "RK2": "14:15", "RK1": "14:45"},
        "track_direction": "ccw",
    }
    response = admin_client.post("/api/admin/event-card/", body, content_type="application/json")
    assert response.status_code == 200, response.content
    event = Event.objects.get(season__year=2026, number=9)
    assert event.status == Event.SCHEDULED and event.location == "Kart Point"
    assert event.schedule == body["schedule"] and event.track_direction == "ccw"
    # Atualiza a mesma etapa, sem duplicar
    body["schedule"] = {"practice": "12:30", "RK3": "", "RK2": "14:15", "RK1": "14:45"}
    admin_client.post("/api/admin/event-card/", body, content_type="application/json")
    assert Event.objects.filter(number=9).count() == 1
    assert Event.objects.get(number=9).schedule == {"practice": "12:30", "RK2": "14:15", "RK1": "14:45"}


def test_event_card_validates_times(admin_client, season):
    response = admin_client.post(
        "/api/admin/event-card/",
        {"number": 9, "schedule": {"RK1": "25:00"}},
        content_type="application/json",
    )
    assert response.status_code == 400


def test_track_upload_and_public_card(admin_client, client, season, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    admin_client.post(
        "/api/admin/event-card/",
        {"number": 9, "date": "2026-10-03", "location": "Kart Point", "track_direction": "cw"},
        content_type="application/json",
    )
    event = Event.objects.get(number=9)
    response = admin_client.post(
        f"/api/admin/events/{event.id}/track/", {"track": track_png("white", "black")}
    )
    assert response.status_code == 200, response.content
    card = client.get("/api/event-card/?event=9").json()
    assert card["event"]["location"] == "Kart Point" and card["track_direction"] == "cw"
    image = client.get(card["track_art"])
    assert image.status_code == 200 and image["Content-Type"] == "image/png"
    # Remover o traçado
    admin_client.delete(f"/api/admin/events/{event.id}/track/")
    assert client.get("/api/event-card/?event=9").json()["track_art"] is None


def test_event_card_defaults_to_next_scheduled(client, imported):
    card = client.get("/api/event-card/").json()
    assert card["event"]["number"] == 9  # E9 é a primeira agendada na planilha de exemplo


def test_import_keeps_typed_schedule(imported):
    """A importação (feita depois da etapa) não mexe nos horários digitados para a arte."""
    from imports import service

    from .conftest import WORKBOOK

    event = Event.objects.get(season__year=2026, number=8)
    event.schedule = {"practice": "13:00", "RK1": "16:10"}
    event.save()
    batch = service.preview(WORKBOOK.name, WORKBOOK.read_bytes(), None)
    service.confirm(batch, {})
    assert Event.objects.get(pk=event.pk).schedule == {"practice": "13:00", "RK1": "16:10"}
    assert Season.objects.count() == 1
