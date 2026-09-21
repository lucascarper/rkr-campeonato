"""Endpoints administrativos: exigem sessão de usuário staff e token CSRF."""

import logging
import re

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.core.cache import cache
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import serializers, status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from imports import service as import_service
from rules.standings import TIEBREAKERS

from . import services
from .models import (
    Category,
    Driver,
    Event,
    ImportBatch,
    RaceResult,
    ScoringRule,
    ScoringTable,
    Season,
    SeasonConfig,
)
from .photos import PhotoError, save_driver_photo
from .tracks import TrackError, save_event_track

logger = logging.getLogger(__name__)

# --- sessão -------------------------------------------------------------------------------------


def _client_ip(request) -> str:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return forwarded.split(",")[0].strip() or request.META.get("REMOTE_ADDR", "")


@api_view(["GET"])
@ensure_csrf_cookie
def session(request):
    user = request.user
    if user and user.is_authenticated and user.is_staff:
        return Response({"authenticated": True, "username": user.get_username()})
    return Response({"authenticated": False})


@api_view(["POST"])
def login_view(request):
    username = str(request.data.get("username", ""))[:150]
    password = str(request.data.get("password", ""))
    key = f"login-attempts:{_client_ip(request)}:{username.lower()}"
    attempts = cache.get(key, 0)
    if attempts >= settings.LOGIN_MAX_ATTEMPTS:
        return Response(
            {"detail": "Muitas tentativas. Aguarde alguns minutos e tente novamente."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    user = authenticate(request, username=username, password=password)
    if not user or not user.is_staff:
        cache.set(key, attempts + 1, settings.LOGIN_LOCK_SECONDS)
        return Response({"detail": "Usuário ou senha inválidos."}, status=status.HTTP_400_BAD_REQUEST)
    cache.delete(key)
    login(request, user)
    return Response({"authenticated": True, "username": user.get_username()})


@api_view(["POST"])
def logout_view(request):
    logout(request)
    return Response({"authenticated": False})


# --- importações --------------------------------------------------------------------------------

ALLOWED_SHEETS = (".xlsx", ".xlsm", ".csv")


def _batch_summary(batch: ImportBatch, full: bool = False) -> dict:
    data = {
        "id": batch.id,
        "filename": batch.filename,
        "author": batch.author.get_username() if batch.author else None,
        "created_at": batch.created_at.isoformat(),
        "confirmed_at": batch.confirmed_at.isoformat() if batch.confirmed_at else None,
        "status": batch.status,
        "status_label": batch.get_status_display(),
        "rows": batch.rows,
        "rows_written": batch.rows_written,
        "errors": batch.report.get("errors", 0),
        "warnings": batch.report.get("warnings", 0),
    }
    if full:
        data["report"] = batch.report
    return data


@api_view(["GET"])
@permission_classes([IsAdminUser])
def imports_list(request):
    return Response([_batch_summary(b) for b in ImportBatch.objects.select_related("author")[:100]])


@api_view(["POST"])
@permission_classes([IsAdminUser])
@parser_classes([MultiPartParser])
def imports_preview(request):
    upload = request.FILES.get("file")
    if not upload:
        return Response({"detail": "Envie um arquivo no campo 'file'."}, status=400)
    if not upload.name.lower().endswith(ALLOWED_SHEETS):
        return Response({"detail": "Formato não aceito. Envie .xlsx ou .csv."}, status=400)
    if upload.size > settings.MAX_UPLOAD_BYTES:
        return Response({"detail": "A planilha deve ter no máximo 5 MB."}, status=400)
    batch = import_service.preview(upload.name, upload.read(), request.user)
    return Response(_batch_summary(batch, full=True), status=201)


@api_view(["GET"])
@permission_classes([IsAdminUser])
def imports_detail(request, pk: int):
    return Response(_batch_summary(get_object_or_404(ImportBatch, pk=pk), full=True))


@api_view(["POST"])
@permission_classes([IsAdminUser])
def imports_confirm(request, pk: int):
    batch = get_object_or_404(ImportBatch, pk=pk)
    try:
        result = import_service.confirm(batch, request.data.get("drivers") or {})
    except import_service.ImportFlowError as exc:
        return Response({"detail": str(exc)}, status=400)
    batch.refresh_from_db()
    return Response({**_batch_summary(batch), "result": result})


@api_view(["POST"])
@permission_classes([IsAdminUser])
def imports_undo(request, pk: int):
    batch = get_object_or_404(ImportBatch, pk=pk)
    try:
        result = import_service.undo(batch)
    except import_service.ImportFlowError as exc:
        return Response({"detail": str(exc)}, status=400)
    batch.refresh_from_db()
    return Response({**_batch_summary(batch), "result": result})


# --- pilotos ------------------------------------------------------------------------------------


class DriverSerializer(serializers.ModelSerializer):
    category = serializers.SlugRelatedField(
        slug_field="code", queryset=Category.objects.all(), allow_null=True, required=False
    )
    photo_url = serializers.SerializerMethodField()
    thumb_url = serializers.SerializerMethodField()
    results = serializers.IntegerField(read_only=True, source="results_count", default=0)

    class Meta:
        model = Driver
        fields = [
            "id",
            "name",
            "nickname",
            "slug",
            "number",
            "category",
            "active",
            "hidden",
            "photo_url",
            "thumb_url",
            "results",
        ]
        read_only_fields = ["slug"]

    def get_photo_url(self, obj):
        return services.photo_url(obj.photo)

    def get_thumb_url(self, obj):
        return services.photo_url(obj.photo_thumb)


def _after_driver_change():
    for season in Season.objects.all():
        services.recalculate(season)
    transaction.on_commit(services.revalidate_web)


@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def drivers(request):
    if request.method == "POST":
        serializer = DriverSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        driver = serializer.save()
        return Response(DriverSerializer(driver).data, status=201)
    qs = (
        Driver.objects.filter(merged_into=None)
        .select_related("category")
        .annotate(results_count=Count("results", filter=Q(results__active=True)))
    )
    search = request.query_params.get("q")
    if search:
        qs = qs.filter(Q(name__icontains=search) | Q(nickname__icontains=search))
    return Response(DriverSerializer(qs, many=True).data)


@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def driver_update(request, pk: int):
    driver = get_object_or_404(Driver, pk=pk)
    before = (driver.category_id, driver.hidden)
    serializer = DriverSerializer(driver, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    with transaction.atomic():
        driver = serializer.save()
        if before != (driver.category_id, driver.hidden):
            _after_driver_change()
        else:
            cache.clear()
            transaction.on_commit(services.revalidate_web)
    return Response(DriverSerializer(driver).data)


@api_view(["POST"])
@permission_classes([IsAdminUser])
@parser_classes([MultiPartParser])
def driver_photo(request, pk: int):
    driver = get_object_or_404(Driver, pk=pk)
    upload = request.FILES.get("photo")
    if not upload:
        return Response({"detail": "Envie a foto no campo 'photo'."}, status=400)
    try:
        save_driver_photo(driver, upload)
    except PhotoError as exc:
        return Response({"detail": str(exc)}, status=400)
    except Exception:
        logger.exception("Falha ao gravar a foto do piloto %s no storage", driver.pk)
        return Response(
            {
                "detail": "A foto não pôde ser gravada no armazenamento de arquivos. "
                "Confira as variáveis S3_* da api "
                "(teste com 'python manage.py check_storage' no shell da api)."
            },
            status=502,
        )
    cache.clear()
    services.revalidate_web()
    return Response(DriverSerializer(driver).data)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def driver_merge(request, pk: int):
    """Une cadastros duplicados: os resultados de `pk` passam para `into`."""
    source = get_object_or_404(Driver, pk=pk)
    target = get_object_or_404(Driver, pk=request.data.get("into"))
    if source == target:
        return Response({"detail": "Escolha outro piloto."}, status=400)
    clash = RaceResult.objects.filter(driver=source, active=True).filter(
        race__in=RaceResult.objects.filter(driver=target, active=True).values("race")
    )
    if clash.exists():
        return Response({"detail": "Os dois cadastros têm resultado na mesma corrida."}, status=400)
    with transaction.atomic():
        moved = RaceResult.objects.filter(driver=source).update(driver=target)
        if not target.category_id and source.category_id:
            target.category_id = source.category_id
        if not target.photo and source.photo:
            target.photo, target.photo_thumb = source.photo, source.photo_thumb
        target.save()
        source.merged_into = target
        source.active = False
        source.save()
        _after_driver_change()
    return Response({"moved": moved, "driver": DriverSerializer(target).data})


# --- etapas -------------------------------------------------------------------------------------


SCHEDULE_KEYS = ("practice", "RK3", "RK2", "RK1")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class EventSerializer(serializers.ModelSerializer):
    races = serializers.SerializerMethodField()
    track_url = serializers.SerializerMethodField()
    track_art_url = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            "id",
            "number",
            "date",
            "location",
            "status",
            "is_preseason",
            "races",
            "schedule",
            "track_direction",
            "track_url",
            "track_art_url",
        ]
        read_only_fields = ["number"]

    def validate_schedule(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Horários inválidos.")
        clean = {}
        for key, time in value.items():
            if key not in SCHEDULE_KEYS:
                raise serializers.ValidationError(f"Horário desconhecido: {key}")
            if time in (None, ""):
                continue
            if not TIME_RE.match(str(time)):
                raise serializers.ValidationError(f"Use HH:MM no horário de {key}.")
            clean[key] = str(time)
        return clean

    def get_track_url(self, obj):
        return services.media_url(obj.track_image)

    def get_track_art_url(self, obj):
        return services.media_url(obj.track_art)

    def get_races(self, obj):
        return [
            {
                "id": r.id,
                "label": r.label,
                "category": r.category.code if r.category else None,
                "table": r.scoring_table.name if r.scoring_table else None,
                "results": r.results.filter(active=True).count(),
            }
            for r in obj.races.select_related("category", "scoring_table")
        ]


@api_view(["GET"])
@permission_classes([IsAdminUser])
def events(request):
    season = services.current_season(request.query_params.get("season"))
    if not season:
        return Response([])
    return Response(EventSerializer(season.events.all(), many=True).data)


@api_view(["POST"])
@permission_classes([IsAdminUser])
@parser_classes([JSONParser])
def event_card(request):
    """Cria ou atualiza a etapa pelos dados da arte "Próxima etapa".

    A planilha só é importada depois da corrida, então a etapa pode ainda não existir.
    Corpo: {number, date, location, schedule: {practice, RK3, RK2, RK1}, track_direction}.
    """
    season = services.current_season(request.data.get("season"))
    if not season:
        return Response({"detail": "Nenhuma temporada cadastrada."}, status=404)
    try:
        number = int(request.data.get("number"))
    except (TypeError, ValueError):
        return Response({"number": ["Informe o número da etapa."]}, status=400)
    if not 1 <= number <= 99:
        return Response({"number": ["Número de etapa inválido."]}, status=400)
    event = Event.objects.filter(season=season, number=number).first() or Event(season=season, number=number)
    data = {
        k: request.data[k] for k in ("date", "location", "schedule", "track_direction") if k in request.data
    }
    serializer = EventSerializer(event, data=data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save(season=season, number=number)
    cache.clear()
    return Response(serializer.data)


@api_view(["POST", "DELETE"])
@permission_classes([IsAdminUser])
@parser_classes([MultiPartParser])
def event_track(request, pk: int):
    """Envia (POST, campo 'track') ou remove (DELETE) o traçado da etapa."""
    event = get_object_or_404(Event, pk=pk)
    if request.method == "DELETE":
        for path in (event.track_image, event.track_art):
            if path:
                default_storage.delete(path)
        event.track_image = event.track_art = ""
        event.save(update_fields=["track_image", "track_art"])
        return Response(EventSerializer(event).data)
    upload = request.FILES.get("track")
    if not upload:
        return Response({"detail": "Envie o traçado no campo 'track'."}, status=400)
    try:
        save_event_track(event, upload)
    except TrackError as exc:
        return Response({"detail": str(exc)}, status=400)
    except Exception:
        logger.exception("Falha ao gravar o traçado da etapa %s", event.pk)
        return Response(
            {"detail": "O traçado não pôde ser gravado no armazenamento de arquivos."}, status=502
        )
    return Response(EventSerializer(event).data)


@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def event_update(request, pk: int):
    event = get_object_or_404(Event, pk=pk)
    serializer = EventSerializer(event, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    cache.clear()
    services.revalidate_web()
    return Response(serializer.data)


# --- regras -------------------------------------------------------------------------------------


class RuleSerializer(serializers.Serializer):
    position = serializers.IntegerField(min_value=1, max_value=99)
    points = serializers.DecimalField(max_digits=6, decimal_places=2)


class TableSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=60)
    is_default = serializers.BooleanField(default=False)
    rules = RuleSerializer(many=True)


class RulesSerializer(serializers.Serializer):
    discards = serializers.IntegerField(min_value=0, max_value=20)
    discard_absences = serializers.BooleanField(default=True)
    consistency_top_n = serializers.IntegerField(min_value=1, max_value=50)
    podium_positions = serializers.IntegerField(min_value=1, max_value=20)
    tiebreak_order = serializers.ListField(child=serializers.ChoiceField(choices=list(TIEBREAKERS)))
    pole_bonus = serializers.DecimalField(max_digits=5, decimal_places=2)
    fastest_lap_bonus = serializers.DecimalField(max_digits=5, decimal_places=2)
    fastest_lap_min_position = serializers.IntegerField(min_value=1, max_value=99)
    dnf_points = serializers.DecimalField(max_digits=5, decimal_places=2)
    shirt_penalty = serializers.DecimalField(max_digits=5, decimal_places=2)
    tables = TableSerializer(many=True)

    def validate_tables(self, tables):
        if not tables:
            raise serializers.ValidationError("Cadastre ao menos uma tabela de pontos.")
        names = [t["name"].strip().lower() for t in tables]
        if len(set(names)) != len(names):
            raise serializers.ValidationError("Nomes de tabela repetidos.")
        if sum(1 for t in tables if t["is_default"]) != 1:
            raise serializers.ValidationError("Marque exatamente uma tabela como padrão.")
        for table in tables:
            positions = [r["position"] for r in table["rules"]]
            if len(set(positions)) != len(positions):
                raise serializers.ValidationError(f"Posição repetida na tabela {table['name']}.")
        return tables


def _rules_payload(season: Season) -> dict:
    config = services.season_config(season)
    return {
        "season": season.year,
        "discards": config.discards,
        "discard_absences": config.discard_absences,
        "consistency_top_n": config.consistency_top_n,
        "podium_positions": config.podium_positions,
        "tiebreak_order": config.tiebreak_order,
        "tiebreak_options": TIEBREAKERS,
        "pole_bonus": float(config.pole_bonus),
        "fastest_lap_bonus": float(config.fastest_lap_bonus),
        "fastest_lap_min_position": config.fastest_lap_min_position,
        "dnf_points": float(config.dnf_points),
        "shirt_penalty": float(config.shirt_penalty),
        "tables": [
            {
                "name": t.name,
                "is_default": t.is_default,
                "rules": [{"position": r.position, "points": float(r.points)} for r in t.rules.all()],
            }
            for t in season.scoring_tables.prefetch_related("rules")
        ],
    }


@api_view(["GET", "PUT"])
@permission_classes([IsAdminUser])
@parser_classes([JSONParser])
def rules(request):
    season = services.current_season(request.query_params.get("season"))
    if not season:
        return Response({"detail": "Nenhuma temporada cadastrada."}, status=404)
    if request.method == "GET":
        return Response(_rules_payload(season))

    serializer = RulesSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    with transaction.atomic():
        config = SeasonConfig.objects.select_for_update().get_or_create(season=season)[0]
        for field in (
            "discards",
            "discard_absences",
            "consistency_top_n",
            "podium_positions",
            "tiebreak_order",
            "pole_bonus",
            "fastest_lap_bonus",
            "fastest_lap_min_position",
            "dnf_points",
            "shirt_penalty",
        ):
            setattr(config, field, data[field])
        config.save()
        keep = []
        for table_data in data["tables"]:
            table, _ = ScoringTable.objects.get_or_create(season=season, name=table_data["name"].strip())
            table.is_default = table_data["is_default"]
            table.save()
            table.rules.all().delete()
            ScoringRule.objects.bulk_create(
                ScoringRule(table=table, position=r["position"], points=r["points"])
                for r in table_data["rules"]
            )
            keep.append(table.id)
        ScoringTable.objects.filter(season=season).exclude(id__in=keep).delete()
        summary = services.recalculate(season)
        transaction.on_commit(services.revalidate_web)
    return Response({**_rules_payload(season), "recalculated": summary})


@api_view(["POST"])
@permission_classes([IsAdminUser])
def recalculate(request):
    season = services.current_season(request.data.get("season") or request.query_params.get("season"))
    if not season:
        return Response({"detail": "Nenhuma temporada cadastrada."}, status=404)
    summary = services.recalculate(season)
    services.revalidate_web()
    return Response({"season": season.year, **summary})


@api_view(["GET"])
@permission_classes([IsAdminUser])
def categories(request):
    return Response([{"code": c.code, "name": c.name} for c in Category.objects.all()])
