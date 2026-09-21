"""Plugin do pytest carregado antes do Django: os testes rodam sem variáveis da Railway."""

import os

os.environ.setdefault("DJANGO_DEBUG", "true")
os.environ.pop("DATABASE_URL", None)
os.environ.pop("S3_BUCKET", None)
