"""Leitura de planilhas de resultados.

Dois formatos são aceitos:

1. **Planilha da organização** (xlsx): aba "Etapas AAAA" com um bloco por corrida
   (cabeçalho "E1A | local | data | hora | OK", depois "Pos. | Pilotos | Corrida | Pole | VR | ..."),
   e abas RK1/RK2/RK3 com a classificação oficial, usada para atribuir a categoria dos pilotos
   e para conferir os totais.
2. **Formato longo** (csv ou xlsx): uma linha por piloto em cada corrida, com as colunas da
   documentação (temporada, etapa, data, corrida, categoria, posicao, piloto, ...). Os nomes das
   colunas aceitam variações (ver COLUMN_ALIASES).

O resultado é um dicionário serializável em JSON (guardado em ImportBatch.payload).
"""

import datetime as dt
import io
import math
import re
from dataclasses import asdict, dataclass, field

import pandas as pd

from championship.models import normalize_name
from rules.types import DNF, DNS, DSQ, FIN, STATUSES


class ImportFormatError(Exception):
    pass


@dataclass
class Issue:
    level: str  # "error" bloqueia a gravação; "warning" só informa
    message: str
    sheet: str = ""
    line: int | None = None
    column: str = ""


@dataclass
class ParsedPenalty:
    kind: str
    seconds: float = 0
    positions: int = 0
    reason: str = ""


@dataclass
class ParsedRow:
    line: int
    position: int | None
    driver: str
    status: str = FIN
    pole: bool = False
    fastest_lap: bool = False
    shirt_penalty: bool = False
    start_position: int | None = None
    best_lap_ms: int | None = None
    laps: int | None = None
    race_points: float | None = None  # pontos só da posição, como vieram na planilha
    sheet_points: float | None = None  # pontos totais da corrida, como vieram na planilha
    penalties: list[ParsedPenalty] = field(default_factory=list)
    notes: str = ""


@dataclass
class ParsedRace:
    season: int
    event_number: int
    label: str
    order: int
    category: str | None  # None = bateria de pré-temporada (categorias misturadas)
    date: str | None = None
    location: str = ""
    start_time: str | None = None
    done: bool = True
    table: str | None = None  # nome da tabela de pontuação, quando a planilha informa
    sheet: str = ""
    line: int | None = None
    rows: list[ParsedRow] = field(default_factory=list)

    @property
    def key(self) -> str:
        return f"{self.season}|{self.event_number}|{self.label}|{self.category or ''}"


@dataclass
class ParsedImport:
    format: str
    races: list[ParsedRace] = field(default_factory=list)
    # nome do piloto -> categoria (abas RK1/RK2/RK3 da planilha da organização)
    category_assignments: dict[str, str] = field(default_factory=dict)
    # categoria -> {nome do piloto: pontos oficiais}
    official_totals: dict[str, dict[str, float]] = field(default_factory=dict)
    issues: list[Issue] = field(default_factory=list)
    columns: list[str] = field(default_factory=list)

    def error(self, message, **where):
        self.issues.append(Issue("error", message, **where))

    def warn(self, message, **where):
        self.issues.append(Issue("warning", message, **where))

    def to_dict(self) -> dict:
        data = asdict(self)
        for race, raw in zip(self.races, data["races"], strict=True):
            raw["key"] = race.key
        return data


# --- utilitários ---------------------------------------------------------------------------------

LAP_RE = re.compile(r"^(?:(\d{1,2}):)?(\d{1,2})[.,](\d{1,3})$")


def parse_lap(value) -> int | None:
    """'00:41.235' ou '41.235' -> 41235 ms. Levanta ValueError para formato inválido."""
    if _blank(value):
        return None
    if isinstance(value, dt.time):
        return ((value.hour * 60 + value.minute) * 60 + value.second) * 1000 + value.microsecond // 1000
    if isinstance(value, int | float):
        # Fração de dia (Excel) ou segundos.
        seconds = value * 86400 if value < 1 else value
        return round(seconds * 1000)
    text = str(value).strip()
    match = LAP_RE.match(text)
    if not match:
        raise ValueError(text)
    minutes, seconds, millis = match.groups()
    return (int(minutes or 0) * 60 + int(seconds)) * 1000 + int(millis.ljust(3, "0"))


def parse_date(value) -> str | None:
    if _blank(value):
        return None
    if isinstance(value, dt.datetime | pd.Timestamp):
        return value.date().isoformat()
    if isinstance(value, dt.date):
        return value.isoformat()
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d %H:%M:%S"):
        try:
            return dt.datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(text)


def _blank(value) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    return isinstance(value, str) and not value.strip()


def _int(value) -> int | None:
    if _blank(value):
        return None
    try:
        number = float(str(value).replace(",", "."))
    except ValueError as exc:
        raise ValueError(str(value)) from exc
    if number != int(number):
        raise ValueError(str(value))
    return int(number)


def _float(value) -> float | None:
    if _blank(value):
        return None
    return float(str(value).replace(",", "."))


def _truthy(value) -> bool:
    if _blank(value):
        return False
    return str(value).strip().lower() not in ("0", "n", "nao", "não", "false", "no")


PENALTY_SECONDS_RE = re.compile(r"([+-]?\s*\d+(?:[.,]\d+)?)\s*s\b", re.IGNORECASE)


def parse_observation(text: str) -> tuple[str | None, list[ParsedPenalty], bool]:
    """Interpreta a coluna "Obs." da planilha da organização.

    Devolve (status ou None, penalizações, reconhecido?). Exemplos:
    "PEN +10s" -> 10 s; "+20s DC Peso" -> 20 s, motivo "DC Peso"; "DQ Parada" -> DSQ, motivo "Parada";
    "STOP&GO" -> stop & go.
    """
    raw = " ".join(str(text).split())
    upper = raw.upper()
    if not raw:
        return None, [], True
    status = None
    penalties: list[ParsedPenalty] = []
    if re.search(r"\b(DQ|DSQ|DESCLASSIFICAD[OA])\b", upper):
        reason = re.sub(r"\b(DQ|DSQ|DESCLASSIFICAD[OA])\b", "", raw, flags=re.IGNORECASE).strip(" -:")
        return DSQ, [ParsedPenalty("dsq", reason=reason or raw)], True
    if re.search(r"\b(DNF|ABANDONO|ABANDONOU)\b", upper):
        status = DNF
    if re.search(r"\bDNS\b|NÃO LARGOU|NAO LARGOU", upper):
        status = DNS
    if "STOP" in upper:
        penalties.append(ParsedPenalty("stop_go", reason=raw))
    for match in PENALTY_SECONDS_RE.finditer(raw):
        seconds = float(match.group(1).replace(" ", "").replace(",", "."))
        reason = PENALTY_SECONDS_RE.sub("", raw)
        reason = re.sub(r"\bPEN\b", "", reason, flags=re.IGNORECASE).strip(" -:+")
        penalties.append(ParsedPenalty("time", seconds=abs(seconds), reason=reason or "Penalização de tempo"))
    pos_match = re.search(r"([+-]?\d+)\s*(pos|posi[cç](?:ão|ões|oes|ao))", raw, re.IGNORECASE)
    if pos_match:
        penalties.append(ParsedPenalty("position", positions=abs(int(pos_match.group(1))), reason=raw))
    recognized = bool(penalties) or status is not None
    return status, penalties, recognized


# --- planilha da organização --------------------------------------------------------------------

BLOCK_RE = re.compile(r"^E\s*(\d+)\s*(?:([A-Z])|(RK\s*\d))$", re.IGNORECASE)
SEASON_SHEET_RE = re.compile(r"^etapas\s*(\d{4})$", re.IGNORECASE)

NATIVE_HEADERS = {
    "pos": "position",
    "pos.": "position",
    "posicao": "position",
    "pilotos": "driver",
    "piloto": "driver",
    "corrida": "race_points",
    "pole": "pole",
    "vr": "fastest_lap",
    "vitoria": "win",
    "camiseta": "shirt",
    "pontos": "points",
    "obs": "notes",
    "obs.": "notes",
    "largada": "start_position",
    "melhor volta": "best_lap",
    "voltas": "laps",
}


def is_native_workbook(sheet_names: list[str]) -> bool:
    return any(SEASON_SHEET_RE.match(name.strip()) for name in sheet_names)


def parse_native_workbook(content: bytes, category_codes: list[str]) -> ParsedImport:
    parsed = ParsedImport(format="rkr")
    sheets = pd.read_excel(io.BytesIO(content), sheet_name=None, header=None, engine="openpyxl")
    season_sheets = [(n, SEASON_SHEET_RE.match(n.strip())) for n in sheets]
    season_sheets = [(n, int(m.group(1))) for n, m in season_sheets if m]
    if not season_sheets:
        raise ImportFormatError('Nenhuma aba "Etapas AAAA" encontrada.')

    for sheet_name, year in season_sheets:
        _parse_native_events(parsed, sheets[sheet_name], sheet_name, year, category_codes)

    for code in category_codes:
        sheet = next((sheets[n] for n in sheets if n.strip().upper() == code), None)
        if sheet is not None:
            _parse_native_standings(parsed, sheet, code)
    return parsed


def _parse_native_events(parsed, df, sheet_name, year, category_codes):
    race: ParsedRace | None = None
    columns: dict[int, str] = {}
    order_by_event: dict[int, int] = {}
    for index, raw in enumerate(df.itertuples(index=False, name=None)):
        line = index + 1
        first = raw[0] if raw else None
        if isinstance(first, str) and BLOCK_RE.match(first.strip()):
            match = BLOCK_RE.match(first.strip())
            number = int(match.group(1))
            heat, category = match.group(2), match.group(3)
            category = category.replace(" ", "").upper() if category else None
            order_by_event[number] = order_by_event.get(number, 0) + 1
            try:
                date = parse_date(raw[2] if len(raw) > 2 else None)
            except ValueError:
                date = None
                parsed.error("Data inválida no cabeçalho da corrida", sheet=sheet_name, line=line, column="C")
            start = raw[3] if len(raw) > 3 else None
            state = raw[4] if len(raw) > 4 else None
            race = ParsedRace(
                season=year,
                event_number=number,
                label=f"Bateria {heat.upper()}" if heat else "Final",
                order=order_by_event[number],
                category=category,
                date=date,
                location=str(raw[1]).strip() if len(raw) > 1 and not _blank(raw[1]) else "",
                start_time=start.strftime("%H:%M") if isinstance(start, dt.time) else None,
                done=isinstance(state, str) and state.strip().upper() == "OK",
                sheet=sheet_name,
                line=line,
            )
            if category and category not in category_codes:
                parsed.error(f"Categoria inválida: {category}", sheet=sheet_name, line=line, column="A")
            parsed.races.append(race)
            columns = {}
            continue
        if race is None:
            continue
        if isinstance(first, str) and normalize_name(first) in ("pos", "posicao"):
            columns = {}
            for col, header in enumerate(raw):
                if isinstance(header, str):
                    key = NATIVE_HEADERS.get(normalize_name(header)) or NATIVE_HEADERS.get(
                        header.strip().lower()
                    )
                    if key:
                        columns[col] = key
            parsed.columns = sorted(set(parsed.columns) | set(columns.values()))
            continue
        if not columns:
            continue
        values = {key: raw[col] if col < len(raw) else None for col, key in columns.items()}
        if _blank(values.get("driver")):
            continue
        _append_native_row(parsed, race, values, sheet_name, line)


def _append_native_row(parsed, race, values, sheet, line):
    try:
        position = _int(values.get("position"))
    except ValueError:
        parsed.error("Posição inválida", sheet=sheet, line=line, column="Pos.")
        position = None
    row = ParsedRow(line=line, position=position, driver=" ".join(str(values["driver"]).split()))
    row.pole = _truthy(values.get("pole"))
    # Na planilha, qualquer valor em "VR" (0 ou 2) marca a volta mais rápida; o 0 é o bônus zerado no pódio.
    row.fastest_lap = not _blank(values.get("fastest_lap"))
    shirt = values.get("shirt")
    row.shirt_penalty = not _blank(shirt) and _float(shirt) != 0
    for key, target in (("race_points", "race_points"), ("points", "sheet_points")):
        try:
            number = _float(values.get(key))
        except ValueError:
            number = None
        # A planilha soma frações minúsculas para desempate; guardamos só 2 casas.
        setattr(row, target, round(number, 2) if number is not None else None)
    for key, parser in (("start_position", _int), ("laps", _int), ("best_lap", parse_lap)):
        if key in values:
            try:
                setattr(row, "best_lap_ms" if key == "best_lap" else key, parser(values[key]))
            except ValueError:
                parsed.error(f"Valor inválido em {key}", sheet=sheet, line=line, column=key)
    note = values.get("notes")
    if not _blank(note):
        status, penalties, recognized = parse_observation(str(note))
        row.notes = str(note).strip()
        row.penalties = penalties
        if status:
            row.status = status
        if not recognized:
            parsed.warn(f'Observação não reconhecida como penalização: "{row.notes}"', sheet=sheet, line=line)
    race.rows.append(row)


def _parse_native_standings(parsed, df, code):
    header_line, name_col, points_col = None, None, None
    for index, raw in enumerate(df.itertuples(index=False, name=None)):
        for col, value in enumerate(raw):
            if isinstance(value, str) and normalize_name(value).startswith("piloto"):
                header_line, name_col = index, col
            if isinstance(value, str) and normalize_name(value) == "pontos":
                points_col = col
        if header_line is not None:
            break
    if header_line is None:
        parsed.warn(f"Aba {code} sem coluna de pilotos; categoria dos pilotos não atribuída", sheet=code)
        return
    totals: dict[str, float] = {}
    for raw in df.iloc[header_line + 1 :].itertuples(index=False, name=None):
        name = raw[name_col] if name_col < len(raw) else None
        if _blank(name):
            continue
        name = " ".join(str(name).split())
        previous = parsed.category_assignments.get(name)
        if previous and previous != code:
            parsed.warn(f"{name} aparece nas abas {previous} e {code}; mantida {code}", sheet=code)
        parsed.category_assignments[name] = code
        if points_col is not None:
            try:
                totals[name] = round(_float(raw[points_col]) or 0, 2)
            except ValueError:
                pass
    parsed.official_totals[code] = totals


# --- formato longo ------------------------------------------------------------------------------

COLUMN_ALIASES = {
    "season": ["temporada", "ano", "season"],
    "event": ["etapa", "evento", "event", "rodada"],
    "date": ["data", "date", "dia"],
    "location": ["local", "kartodromo", "pista", "cidade"],
    "race": ["corrida", "bateria", "race", "prova"],
    "category": ["categoria", "category", "cat"],
    "position": ["posicao", "pos", "posicao final", "chegada", "position"],
    "driver": ["piloto", "pilotos", "nome", "driver"],
    "start_position": ["largada", "grid", "posicao largada", "posicao de largada"],
    "best_lap": ["melhor volta", "melhor_volta", "mv", "best lap", "volta"],
    "laps": ["voltas", "laps", "voltas completadas"],
    "status": ["status", "situacao"],
    "penalties": ["penalizacoes", "penalizacao", "penalidades", "pen"],
    "penalty_seconds": ["penalizacao segundos", "penalizacao_segundos", "segundos penalizacao"],
    "penalty_reason": ["motivo penalizacao", "motivo_penalizacao", "motivo", "obs", "observacao"],
    "points": ["pontos", "points"],
    "pole": ["pole"],
    "fastest_lap": ["vr", "volta rapida", "volta mais rapida"],
    "shirt": ["camiseta"],
    "table": ["tabela", "tabela pontos", "tabela de pontos"],
}
REQUIRED_LONG = ["season", "event", "date", "race", "category", "position", "driver"]
LONG_LABELS = {
    "season": "temporada",
    "event": "etapa",
    "date": "data",
    "race": "corrida",
    "category": "categoria",
    "position": "posicao",
    "driver": "piloto",
}
PRESEASON_CATEGORY = {"", "PRE", "PRÉ", "PRE-TEMPORADA", "PRÉ-TEMPORADA", "CLASSIFICATORIA"}


def _header_key(header: str) -> str:
    return normalize_name(str(header).replace("_", " "))


def map_columns(headers: list[str]) -> dict[str, str]:
    lookup = {}
    for field_name, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            lookup[_header_key(alias)] = field_name
    mapping = {}
    for header in headers:
        key = lookup.get(_header_key(header))
        if key and key not in mapping.values():
            mapping[header] = key
    return mapping


def parse_long_table(df: pd.DataFrame, category_codes: list[str], sheet: str = "") -> ParsedImport:
    parsed = ParsedImport(format="long")
    mapping = map_columns(list(df.columns))
    df = df.rename(columns=mapping)
    parsed.columns = sorted(set(mapping.values()))
    missing = [LONG_LABELS[c] for c in REQUIRED_LONG if c not in df.columns]
    if missing:
        raise ImportFormatError("Colunas obrigatórias ausentes: " + ", ".join(missing))

    races: dict[str, ParsedRace] = {}
    orders: dict[tuple, int] = {}
    for index, record in enumerate(df.to_dict("records")):
        line = index + 2  # linha 1 é o cabeçalho
        if all(_blank(v) for v in record.values()):
            continue
        try:
            season, event = _int(record["season"]), _int(record["event"])
        except ValueError:
            parsed.error("Temporada ou etapa inválida", sheet=sheet, line=line, column="temporada/etapa")
            continue
        try:
            date = parse_date(record["date"])
        except ValueError:
            parsed.error(f"Data inválida: {record['date']}", sheet=sheet, line=line, column="data")
            date = None
        raw_category = "" if _blank(record["category"]) else str(record["category"]).strip().upper()
        category = None if raw_category in PRESEASON_CATEGORY else raw_category.replace(" ", "")
        if category and category not in category_codes:
            parsed.error(f"Categoria inválida: {raw_category}", sheet=sheet, line=line, column="categoria")
        label = " ".join(str(record["race"]).split()) if not _blank(record["race"]) else "Final"
        race_key = f"{season}|{event}|{label}|{category or ''}"
        if race_key not in races:
            orders[(season, event)] = orders.get((season, event), 0) + 1
            races[race_key] = ParsedRace(
                season=season,
                event_number=event,
                label=label,
                order=orders[(season, event)],
                category=category,
                date=date,
                location="" if _blank(record.get("location")) else str(record["location"]).strip(),
                table=None if _blank(record.get("table")) else str(record["table"]).strip(),
                sheet=sheet,
                line=line,
            )
        race = races[race_key]
        if date and race.date and date != race.date:
            parsed.error("Data diferente para a mesma etapa", sheet=sheet, line=line, column="data")

        row = ParsedRow(
            line=line,
            position=None,
            driver="" if _blank(record["driver"]) else " ".join(str(record["driver"]).split()),
        )
        if not row.driver:
            parsed.error("Piloto em branco", sheet=sheet, line=line, column="piloto")
            continue
        for key, parser, label_ in (
            ("position", _int, "posicao"),
            ("start_position", _int, "largada"),
            ("laps", _int, "voltas"),
            ("best_lap", parse_lap, "melhor_volta"),
            ("points", _float, "pontos"),
        ):
            if key not in record:
                continue
            try:
                value = parser(record[key])
            except ValueError:
                message = (
                    "Tempo fora do formato mm:ss.mmm" if key == "best_lap" else f"Valor inválido em {label_}"
                )
                parsed.error(message, sheet=sheet, line=line, column=label_)
                continue
            target = {"best_lap": "best_lap_ms", "points": "sheet_points"}.get(key, key)
            setattr(row, target, value)

        status = FIN if _blank(record.get("status")) else str(record["status"]).strip().upper()
        status = {"DQ": DSQ, "ABANDONO": DNF}.get(status, status)
        if status not in STATUSES:
            parsed.error(f"Status inválido: {status}", sheet=sheet, line=line, column="status")
            status = FIN
        row.status = status
        if row.position is None and status == FIN:
            parsed.error("Posição obrigatória para quem terminou", sheet=sheet, line=line, column="posicao")

        row.pole = _truthy(record.get("pole")) if "pole" in record else row.start_position == 1
        row.fastest_lap = _truthy(record.get("fastest_lap")) if "fastest_lap" in record else False
        row.shirt_penalty = _truthy(record.get("shirt")) if "shirt" in record else False

        count = (
            _int(record.get("penalties"))
            if "penalties" in record and not _blank(record.get("penalties"))
            else 0
        )
        seconds = _float(record.get("penalty_seconds")) if "penalty_seconds" in record else None
        reason = "" if _blank(record.get("penalty_reason")) else str(record["penalty_reason"]).strip()
        if status == DSQ:
            row.penalties.append(ParsedPenalty("dsq", reason=reason))
        elif count or seconds:
            count = count or 1
            for _ in range(count):
                row.penalties.append(
                    ParsedPenalty(
                        "time" if seconds else "other",
                        seconds=round((seconds or 0) / count, 1),
                        reason=reason,
                    )
                )
        row.notes = reason
        race.rows.append(row)

    # Sem coluna de VR, a volta mais rápida é deduzida do menor tempo da corrida.
    if "fastest_lap" not in df.columns and "best_lap" in df.columns:
        for race in races.values():
            laps = [r.best_lap_ms for r in race.rows if r.best_lap_ms]
            if laps:
                best = min(laps)
                for r in race.rows:
                    r.fastest_lap = r.best_lap_ms == best
    parsed.races = list(races.values())
    return parsed


def parse_file(filename: str, content: bytes, category_codes: list[str]) -> ParsedImport:
    name = filename.lower()
    if name.endswith((".xlsx", ".xlsm")):
        try:
            book = pd.ExcelFile(io.BytesIO(content), engine="openpyxl")
        except Exception as exc:  # arquivo corrompido ou não é xlsx
            raise ImportFormatError("Não foi possível ler o arquivo Excel.") from exc
        if is_native_workbook(book.sheet_names):
            return parse_native_workbook(content, category_codes)
        sheet = book.sheet_names[0]
        return parse_long_table(book.parse(sheet), category_codes, sheet=sheet)
    if name.endswith(".csv"):
        text = None
        for encoding in ("utf-8-sig", "latin-1"):
            try:
                text = content.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        df = pd.read_csv(io.StringIO(text), sep=None, engine="python", dtype=str, keep_default_na=False)
        return parse_long_table(df, category_codes, sheet="CSV")
    raise ImportFormatError("Envie um arquivo .xlsx ou .csv.")


def validate(parsed: ParsedImport) -> None:
    """Validações que dependem do conjunto: posições repetidas e corridas vazias."""
    seen_keys: set[str] = set()
    for race in parsed.races:
        where = {"sheet": race.sheet, "line": race.line}
        if race.key in seen_keys:
            parsed.error(f"Corrida repetida no arquivo: etapa {race.event_number} {race.label}", **where)
        seen_keys.add(race.key)
        positions: dict[int, ParsedRow] = {}
        names: set[str] = set()
        for row in race.rows:
            if row.position is not None:
                if row.position in positions:
                    parsed.error(
                        f"Posição {row.position} repetida na etapa {race.event_number} {race.label}",
                        sheet=race.sheet,
                        line=row.line,
                        column="posicao",
                    )
                positions[row.position] = row
            key = normalize_name(row.driver)
            if key in names:
                parsed.error(
                    f"{row.driver} aparece duas vezes na mesma corrida", sheet=race.sheet, line=row.line
                )
            names.add(key)
        if race.done and not race.rows:
            parsed.warn(
                f"Etapa {race.event_number} {race.label} marcada como realizada, mas sem resultados", **where
            )
