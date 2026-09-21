import pandas as pd
import pytest

from imports.parsers import ImportFormatError, parse_lap, parse_long_table, parse_observation, validate

CODES = ["RK1", "RK2", "RK3"]


@pytest.mark.parametrize(
    ("text", "status", "kinds", "seconds"),
    [
        ("PEN +10s", None, ["time"], 10),
        ("PEN+10s", None, ["time"], 10),
        ("+20s DC Peso", None, ["time"], 20),
        ("DQ Parada", "DSQ", ["dsq"], 0),
        ("DQ Peso", "DSQ", ["dsq"], 0),
        ("STOP&GO", None, ["stop_go"], 0),
    ],
)
def test_parse_observation(text, status, kinds, seconds):
    got_status, penalties, recognized = parse_observation(text)
    assert recognized and got_status == status
    assert [p.kind for p in penalties] == kinds
    assert sum(p.seconds for p in penalties) == seconds


def test_parse_observation_reason():
    _, penalties, _ = parse_observation("+20s DC Peso")
    assert penalties[0].reason == "DC Peso"
    _, penalties, _ = parse_observation("DQ Parada")
    assert penalties[0].reason == "Parada"


def test_parse_lap():
    assert parse_lap("00:41.235") == 41235
    assert parse_lap("1:02.5") == 62500
    assert parse_lap("41.410") == 41410
    with pytest.raises(ValueError):
        parse_lap("41s")


def long_df(rows):
    header = [
        "temporada",
        "etapa",
        "data",
        "corrida",
        "categoria",
        "posicao",
        "piloto",
        "largada",
        "melhor_volta",
        "status",
        "penalizacoes",
    ]
    return pd.DataFrame(rows, columns=header).astype(str)


def test_long_format_example_from_docs():
    df = long_df(
        [
            [2026, 1, "2026-03-14", "Final", "RK1", 1, "Piloto A", 2, "00:41.235", "FIN", 0],
            [2026, 1, "2026-03-14", "Final", "RK1", 2, "Piloto B", 1, "00:41.410", "FIN", 1],
            [2026, 1, "2026-03-14", "Final", "RK1", 3, "Piloto C", 3, "00:41.298", "FIN", 0],
        ]
    )
    parsed = parse_long_table(df, CODES)
    validate(parsed)
    assert not [i for i in parsed.issues if i.level == "error"]
    race = parsed.races[0]
    assert race.category == "RK1" and len(race.rows) == 3
    a, b, _ = race.rows
    assert a.fastest_lap and not b.fastest_lap  # menor tempo da corrida
    assert b.pole  # largada 1
    assert len(b.penalties) == 1


def test_long_format_aliases_and_date_formats():
    df = pd.DataFrame(
        [["2026", "2", "14/03/2026", "Bateria A", "", "1", "Fulano"]],
        columns=["Ano", "Etapa", "Data", "Bateria", "Categoria", "Pos", "Nome"],
    )
    parsed = parse_long_table(df, CODES)
    race = parsed.races[0]
    assert race.date == "2026-03-14" and race.category is None and race.label == "Bateria A"


def test_long_format_errors():
    df = long_df(
        [
            [2026, 1, "2026-13-40", "Final", "RK9", 1, "A", "", "41s", "FIN", 0],
            [2026, 1, "2026-03-14", "Final", "RK9", 1, "B", "", "", "XYZ", 0],
        ]
    )
    parsed = parse_long_table(df, CODES)
    validate(parsed)
    messages = " | ".join(i.message for i in parsed.issues if i.level == "error")
    assert "Data inválida" in messages
    assert "Categoria inválida" in messages
    assert "mm:ss.mmm" in messages
    assert "Status inválido" in messages
    assert "repetida" in messages


def test_missing_required_columns():
    with pytest.raises(ImportFormatError):
        parse_long_table(pd.DataFrame([[1]], columns=["piloto"]), CODES)
