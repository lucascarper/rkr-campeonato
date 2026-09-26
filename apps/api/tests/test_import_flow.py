import openpyxl
import pytest

from championship.models import Driver, Event, ImportBatch, RaceResult, Standing
from imports import service

from .conftest import WORKBOOK


def official(category):
    wb = openpyxl.load_workbook(WORKBOOK, data_only=True)
    return {r[1]: (r[0], round(r[5], 2)) for r in wb[category].iter_rows(min_row=3, values_only=True) if r[1]}


@pytest.mark.parametrize("category", ["RK1", "RK2", "RK3"])
def test_standings_match_official_sheet(imported, category):
    ours = {
        s.driver.name: (s.position, float(s.points))
        for s in Standing.objects.filter(category__code=category, upto_event=8).select_related("driver")
    }
    assert ours == official(category)


def test_report_checks_totals_against_sheet(imported):
    check = imported.report["official_check"]
    assert check["checked"] == 67 and check["mismatches"] == 0


def test_endurance_table_detected(imported):
    tables = {r["key"]: r["table"] for r in imported.report["races"]}
    assert tables["2026|7|Final|RK1"] == "Endurance"
    assert tables["2026|4|Final|RK1"] == "Padrão"


def test_preseason_events_and_penalties(imported):
    assert Event.objects.get(number=1).is_preseason
    assert str(Event.objects.get(number=1).date) == "2026-02-07"
    assert not Event.objects.get(number=4).is_preseason
    assert Event.objects.get(number=9).status == Event.SCHEDULED
    dq = RaceResult.objects.get(race__event__number=7, race__category__code="RK1", position=16)
    assert dq.status == "DSQ" and dq.penalty_set.get().kind == "dsq"


def test_reimport_is_idempotent(imported):
    batch = service.preview(WORKBOOK.name, WORKBOOK.read_bytes(), None)
    assert batch.report["summary"] == {"new": 0, "replace": 0, "unchanged": 24}
    service.confirm(batch, {})
    assert RaceResult.objects.filter(active=True).count() == 332


def csv_bytes(rows):
    header = "temporada,etapa,data,corrida,categoria,posicao,piloto,status\n"
    return (header + "\n".join(",".join(map(str, r)) for r in rows)).encode()


def test_replace_and_undo(imported):
    leader = Standing.objects.get(category__code="RK1", upto_event=8, position=1).driver
    # Reenvia a E8 RK1 só com dois pilotos, invertendo o resultado.
    content = csv_bytes(
        [
            [2026, 8, "2026-09-12", "Final", "RK1", 1, "Bárbara Louly", "FIN"],
            [2026, 8, "2026-09-12", "Final", "RK1", 2, leader.name, "FIN"],
        ]
    )
    batch = service.preview("e8.csv", content, None)
    assert batch.report["summary"]["replace"] == 1
    service.confirm(batch, {})
    assert (
        RaceResult.objects.filter(active=True, race__event__number=8, race__category__code="RK1").count() == 2
    )

    service.undo(batch)
    batch.refresh_from_db()
    assert batch.status == ImportBatch.UNDONE
    assert (
        RaceResult.objects.filter(active=True, race__event__number=8, race__category__code="RK1").count()
        == 14
    )
    assert Standing.objects.get(category__code="RK1", upto_event=8, position=1).driver == leader


def test_undo_blocked_when_replaced_later(imported):
    first = service.preview(
        "a.csv", csv_bytes([[2026, 8, "2026-09-12", "Final", "RK1", 1, "Bárbara Louly", "FIN"]]), None
    )
    service.confirm(first, {})
    second = service.preview(
        "b.csv", csv_bytes([[2026, 8, "2026-09-12", "Final", "RK1", 1, "Rodrigo Spetto", "FIN"]]), None
    )
    service.confirm(second, {})
    with pytest.raises(service.ImportFlowError):
        service.undo(first)


def test_similar_name_requires_decision(imported):
    batch = service.preview(
        "x.csv", csv_bytes([[2026, 8, "2026-09-12", "Final", "RK1", 1, "Barbara Loulí", "FIN"]]), None
    )
    assert batch.report["pending_drivers"] == ["Barbara Loulí"]
    with pytest.raises(service.ImportFlowError):
        service.confirm(batch, {})
    target = Driver.objects.get(name="Bárbara Louly")
    service.confirm(batch, {"Barbara Loulí": {"action": "link", "driver_id": target.id}})
    assert not Driver.objects.filter(name="Barbara Loulí").exists()


def test_blocking_errors_prevent_confirm(imported):
    batch = service.preview(
        "bad.csv",
        csv_bytes(
            [
                [2026, 8, "2026-09-12", "Final", "RK1", 1, "A", "FIN"],
                [2026, 8, "2026-09-12", "Final", "RK1", 1, "B", "FIN"],
            ]
        ),
        None,
    )
    assert batch.report["errors"] > 0
    with pytest.raises(service.ImportFlowError):
        service.confirm(batch, {})


def test_preview_survives_storage_failure(season, monkeypatch):
    """Bucket mal configurado não pode impedir a importação: vira aviso na pré-visualização."""

    def broken_save(*args, **kwargs):
        raise RuntimeError("InvalidAccessKeyId")

    monkeypatch.setattr(ImportBatch._meta.get_field("file").storage, "save", broken_save)
    batch = service.preview(WORKBOOK.name, WORKBOOK.read_bytes(), None)
    assert batch.report["errors"] == 0
    assert any("auditoria" in i["message"] for i in batch.report["issues"])
    service.confirm(batch, {})
    assert RaceResult.objects.filter(active=True).count() == 332


def test_preview_projects_standings_movements(imported):
    """Prévia mostra quem sobe e quem cai antes de gravar."""
    leader = Standing.objects.get(category__code="RK1", upto_event=8, position=1).driver
    # Reenvia a E8 RK1 sem o líder (perde 21 pontos) e com Rodrigo Spetto, que não tinha corrido, em 2º.
    content = csv_bytes(
        [
            [2026, 8, "2026-09-12", "Final", "RK1", 1, "Bárbara Louly", "FIN"],
            [2026, 8, "2026-09-12", "Final", "RK1", 2, "Rodrigo Spetto", "FIN"],
        ]
    )
    batch = service.preview("e8.csv", content, None)
    movements = batch.report["movements"]
    assert movements["compared"] is True
    by_name = {m["driver"]: m for m in movements["rows"] if m["category"] == "RK1"}
    spetto = by_name["Rodrigo Spetto"]
    assert spetto["before_position"] == 3 and spetto["after_position"] == 1 and spetto["change"] == 2
    assert spetto["after_points"] == spetto["before_points"] + 20
    assert by_name[leader.name]["before_position"] == 1 and by_name[leader.name]["change"] < 0
    assert "Bárbara Louly" not in by_name or by_name["Bárbara Louly"]["after_points"] == 133


def test_preview_without_changes_has_no_movements(imported):
    batch = service.preview(WORKBOOK.name, WORKBOOK.read_bytes(), None)
    assert batch.report["movements"] == {"compared": True, "rows": []}
