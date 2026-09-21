"""Traçado da pista para as artes: extrai a linha da pista de qualquer imagem e redesenha no visual RKR.

Os kartódromos mandam o traçado em estilos diferentes (linha preta em fundo branco, colorida, fundo
transparente, fundo escuro). Guardamos o original e geramos uma versão com a linha em branco e um
brilho vermelho, sobre fundo transparente, que funciona no fundo escuro das artes.
"""

import hashlib
import io

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError

from .models import Event

ALLOWED_FORMATS = {"PNG", "JPEG", "WEBP"}
MAX_SIDE = 1400
RED = (225, 6, 19)


class TrackError(ValueError):
    pass


def track_mask(image: Image.Image) -> Image.Image:
    """Máscara (L, 0–255) com 255 onde está o desenho da pista."""
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    transparent = sum(alpha.histogram()[:16]) / (alpha.width * alpha.height)
    if transparent > 0.2:
        mask = alpha  # PNG com fundo transparente: o desenho é o que não é transparente
    else:
        gray = ImageOps.grayscale(rgba.convert("RGB"))
        w, h = gray.size
        border = [gray.getpixel((x, y)) for x in range(0, w, max(1, w // 40)) for y in (0, h - 1)]
        border += [gray.getpixel((x, y)) for y in range(0, h, max(1, h // 40)) for x in (0, w - 1)]
        background = sum(border) / len(border)
        # Fundo claro: a pista é o que é escuro. Fundo escuro: a pista é o que é claro.
        mask = ImageOps.invert(gray) if background > 127 else gray
        # Remove o "chão" (fundo levemente diferente de branco/preto) e reforça o traço.
        mask = mask.point(lambda v: 0 if v < 40 else min(255, int((v - 40) * 1.6)))
    return mask


def render_track_art(image: Image.Image) -> Image.Image:
    mask = track_mask(image)
    box = mask.getbbox()
    if not box:
        raise TrackError("Não foi possível encontrar o desenho da pista na imagem.")
    mask = mask.crop(box)
    mask.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)

    pad = 60
    size = (mask.width + 2 * pad, mask.height + 2 * pad)
    canvas_mask = Image.new("L", size, 0)
    canvas_mask.paste(mask, (pad, pad))

    glow_alpha = canvas_mask.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(18))
    glow = Image.new("RGBA", size, (*RED, 0))
    glow.putalpha(glow_alpha.point(lambda v: int(v * 0.85)))
    line = Image.new("RGBA", size, (255, 255, 255, 0))
    line.putalpha(canvas_mask)
    return Image.alpha_composite(glow, line)


def save_event_track(event: Event, upload) -> Event:
    if upload.size > settings.MAX_UPLOAD_BYTES:
        raise TrackError("O traçado deve ter no máximo 5 MB.")
    raw = upload.read()
    try:
        image = Image.open(io.BytesIO(raw))
        image.verify()
        image = Image.open(io.BytesIO(raw))
    except (UnidentifiedImageError, OSError) as exc:
        raise TrackError("Arquivo de imagem inválido.") from exc
    if image.format not in ALLOWED_FORMATS:
        raise TrackError("Envie PNG, JPG ou WebP.")
    image = ImageOps.exif_transpose(image)
    art = render_track_art(image)

    digest = hashlib.sha1(raw).hexdigest()[:10]
    base = f"tracks/{event.season.year}-e{event.number}/{digest}"
    original = io.BytesIO()
    image.save(original, "PNG")
    rendered = io.BytesIO()
    art.save(rendered, "PNG", optimize=True)
    old = [event.track_image, event.track_art]
    event.track_image = default_storage.save(f"{base}-original.png", ContentFile(original.getvalue()))
    event.track_art = default_storage.save(f"{base}-art.png", ContentFile(rendered.getvalue()))
    event.save(update_fields=["track_image", "track_art"])
    for path in old:
        if path and path not in (event.track_image, event.track_art):
            default_storage.delete(path)
    return event
