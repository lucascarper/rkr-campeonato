from django.contrib import admin
from django.urls import re_path

from championship import views_admin as adm
from championship import views_public as pub
from championship.media import media_file


def api(pattern: str, view, name: str):
    """Rotas da API aceitam a barra final opcional (o proxy do Next.js pode removê-la)."""
    return re_path(rf"^api/{pattern}/?$", view, name=name)


urlpatterns = [
    api("health", pub.health, "health"),
    api("categories", pub.categories, "categories"),
    api("events", pub.events, "events"),
    api("standings", pub.standings, "standings"),
    api("dashboard", pub.dashboard, "dashboard"),
    api(r"drivers/(?P<slug>[-\w]+)", pub.driver_detail, "driver-detail"),
    api("podium", pub.podium, "podium"),
    api("event-card", pub.event_card, "event-card"),
    api("admin/session", adm.session, "admin-session"),
    api("admin/login", adm.login_view, "admin-login"),
    api("admin/logout", adm.logout_view, "admin-logout"),
    api("admin/imports", adm.imports_list, "admin-imports"),
    api("admin/imports/preview", adm.imports_preview, "admin-imports-preview"),
    api(r"admin/imports/(?P<pk>\d+)", adm.imports_detail, "admin-imports-detail"),
    api(r"admin/imports/(?P<pk>\d+)/confirm", adm.imports_confirm, "admin-imports-confirm"),
    api(r"admin/imports/(?P<pk>\d+)/undo", adm.imports_undo, "admin-imports-undo"),
    api("admin/drivers", adm.drivers, "admin-drivers"),
    api(r"admin/drivers/(?P<pk>\d+)", adm.driver_update, "admin-driver-update"),
    api(r"admin/drivers/(?P<pk>\d+)/photo", adm.driver_photo, "admin-driver-photo"),
    api(r"admin/drivers/(?P<pk>\d+)/merge", adm.driver_merge, "admin-driver-merge"),
    api("admin/events", adm.events, "admin-events"),
    api(r"admin/events/(?P<pk>\d+)", adm.event_update, "admin-event-update"),
    api(r"admin/events/(?P<pk>\d+)/track", adm.event_track, "admin-event-track"),
    api("admin/event-card", adm.event_card, "admin-event-card"),
    api("admin/rules", adm.rules, "admin-rules"),
    api("admin/recalculate", adm.recalculate, "admin-recalculate"),
    api("admin/categories", adm.categories, "admin-categories"),
    # Admin nativo do Django, como apoio para correções pontuais.
    re_path(r"^django-admin/", admin.site.urls),
]

# Só fotos de pilotos e traçados são públicos; as planilhas ficam no mesmo storage e nunca são servidas.
urlpatterns.append(re_path(r"^media/(?P<path>(?:drivers|tracks)/[-\w./]+)$", media_file, name="media-file"))
