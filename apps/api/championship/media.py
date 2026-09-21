"""Entrega das fotos dos pilotos a partir do storage (bucket S3 privado ou disco)."""

import io
import mimetypes

from django.core.files.storage import default_storage
from django.http import FileResponse, Http404, HttpResponse
from django.views.decorators.http import require_GET
from PIL import Image

# Nomes com hash do conteúdo (ver photos.py): o arquivo nunca muda, então pode ficar em cache por 1 ano.
CACHE_FOREVER = "public, max-age=31536000, immutable"


@require_GET
def media_file(request, path: str):
    """Foto do piloto. Com ?format=jpeg, converte (o gerador de artes não lê WebP)."""
    if ".." in path.split("/") or not path.startswith("drivers/"):
        raise Http404
    try:
        handle = default_storage.open(path, "rb")
    except (FileNotFoundError, OSError) as exc:
        raise Http404 from exc
    except Exception as exc:  # ex.: objeto inexistente no S3 (ClientError 404)
        raise Http404 from exc

    if request.GET.get("format") == "jpeg":
        with handle, Image.open(handle) as image:
            buffer = io.BytesIO()
            image.convert("RGB").save(buffer, "JPEG", quality=88, optimize=True)
        response = HttpResponse(buffer.getvalue(), content_type="image/jpeg")
    else:
        content_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
        response = FileResponse(handle, content_type=content_type)
    response["Cache-Control"] = CACHE_FOREVER
    return response
