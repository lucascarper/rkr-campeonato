"""Fotos dos pilotos: validação, recorte e conversão para WebP em tamanhos fixos (Pillow)."""

import hashlib
import io

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image, ImageOps, UnidentifiedImageError

from .models import Driver

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
THUMB_SIZE = (160, 160)  # miniatura da tabela (exibida a 40 px, 4x para telas retina)
LARGE_SIZE = (900, 1200)  # janela do piloto, retrato 3:4


class PhotoError(ValueError):
    pass


def _webp(image: Image.Image, quality: int) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, "WEBP", quality=quality, method=6)
    return buffer.getvalue()


def save_driver_photo(driver: Driver, upload) -> Driver:
    if upload.size > settings.MAX_UPLOAD_BYTES:
        raise PhotoError("A foto deve ter no máximo 5 MB.")
    raw = upload.read()
    try:
        image = Image.open(io.BytesIO(raw))
        image.verify()
        image = Image.open(io.BytesIO(raw))
    except (UnidentifiedImageError, OSError) as exc:
        raise PhotoError("Arquivo de imagem inválido.") from exc
    if image.format not in ALLOWED_FORMATS:
        raise PhotoError("Envie JPG, PNG ou WebP.")

    image = ImageOps.exif_transpose(image)
    image = image.convert("RGBA" if image.mode in ("RGBA", "LA", "P") else "RGB")
    thumb = ImageOps.fit(image, THUMB_SIZE, Image.Resampling.LANCZOS, centering=(0.5, 0.3))
    large = ImageOps.fit(image, LARGE_SIZE, Image.Resampling.LANCZOS, centering=(0.5, 0.35))

    # O hash no nome permite cache "imutável" de 1 ano: foto nova = URL nova.
    digest = hashlib.sha1(raw).hexdigest()[:10]
    old = [driver.photo, driver.photo_thumb]
    driver.photo = default_storage.save(
        f"drivers/{driver.slug}/{digest}-lg.webp", ContentFile(_webp(large, 82))
    )
    driver.photo_thumb = default_storage.save(
        f"drivers/{driver.slug}/{digest}-thumb.webp", ContentFile(_webp(thumb, 78))
    )
    driver.save(update_fields=["photo", "photo_thumb"])
    for path in old:
        if path and path not in (driver.photo, driver.photo_thumb):
            default_storage.delete(path)
    return driver
