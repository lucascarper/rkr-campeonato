from django.contrib import admin

from .models import (
    Category,
    Driver,
    Event,
    ImportBatch,
    Penalty,
    Race,
    RaceResult,
    ScoringRule,
    ScoringTable,
    Season,
    SeasonConfig,
)


class ScoringRuleInline(admin.TabularInline):
    model = ScoringRule
    extra = 0


@admin.register(ScoringTable)
class ScoringTableAdmin(admin.ModelAdmin):
    list_display = ["name", "season", "is_default"]
    inlines = [ScoringRuleInline]


@admin.register(Driver)
class DriverAdmin(admin.ModelAdmin):
    list_display = ["name", "nickname", "category", "active", "hidden"]
    list_filter = ["category", "active", "hidden"]
    search_fields = ["name", "nickname"]


class PenaltyInline(admin.TabularInline):
    model = Penalty
    extra = 0


@admin.register(RaceResult)
class RaceResultAdmin(admin.ModelAdmin):
    list_display = ["race", "position", "driver", "status", "points", "active"]
    list_filter = ["race__event__season", "race__category", "active", "status"]
    search_fields = ["driver__name"]
    inlines = [PenaltyInline]


@admin.register(Race)
class RaceAdmin(admin.ModelAdmin):
    list_display = ["event", "label", "category", "scoring_table"]
    list_filter = ["event__season", "category"]


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ["number", "season", "date", "location", "status", "is_preseason"]
    list_filter = ["season", "status"]


@admin.register(ImportBatch)
class ImportBatchAdmin(admin.ModelAdmin):
    list_display = ["id", "filename", "author", "created_at", "status", "rows_written"]
    readonly_fields = ["payload", "report"]


admin.site.register([Season, Category, SeasonConfig])
admin.site.site_header = "RKR · Administração"
