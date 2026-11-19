#!/usr/bin/env python3
"""
Build the data file used by the web app: site/data/data.json

Sources:

1. data/all_federal_councillors.csv
   Every Federal Councillor since 1848 (name, gender, canton, party, dates).
   All councillors are exported; the web app itself works out the
   successive compositions of the Council and which one is current.

2. data/wikidata.json, written by scripts/fetch_wikidata.py:
   birth date, languages and portrait of each councillor.

   data/candidates.csv (optional): people the user can pick from when
   replacing a councillor ("Offizielle Kandidierende"). Columns: name, gender
   (female/male), party (e.g. SP, Mitte, FDP, SVP, GRÜNE, GLP), language
   (de/fr/it/rm/other, or Deutsch, Französisch, …), birth_date (YYYY-MM-DD,
   or just YYYY), canton (optional).

3. Federal Statistical Office (FSO / BFS), the population side of every
   comparison. Each comparison uses the population of the time:
   - Gender and age: STAT-TAB PxWeb table px-x-0102030000_101
     "Ständige Wohnbevölkerung nach Geschlecht und Alter", every year
     since 1860. Age is grouped as 18-39, 40-64 and 65+ (adults only).
   - Language: table T 01.08.01.01 "Hauptsprachen seit 1910"
     (censuses until 2000, yearly since 2010). Which languages make up
     "other languages": table T 01.08.01.02 (since 2010).
   - Party: table T 17.02.02.03.01 "Nationalratswahlen: Stärke der
     Parteien" (every National Council election since 1919).
   - Grossregion (the seven regions the BFS groups the cantons into):
     population by canton from table su-t-vz15-ch-01 "Bevölkerungsentwicklung
     nach Grossregionen und Kantonen 1850-2000" (censuses, used until 1970),
     then yearly from STAT-TAB table px-x-0102020000_101 "Demografische
     Bilanz nach Kanton" (since 1971), summed per Grossregion.
   The Excel tables are downloaded through the BFS asset API by their table
   number, so a new edition is picked up automatically.

Usage
    python3 scripts/build_data.py

Only the Python standard library is used, so no `pip install` is needed.
The PxWeb part is a Python port of the R script swiss_gender_share.R:
variables are detected by their content (labels), not by hard-coded codes.
Note that the year codes in that table are indices ("0" = 1860), which is
why years are read from their labels.
"""

from __future__ import annotations

import csv
import io
import json
import re
import struct
import sys
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

# --- paths & constants ---------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "all_federal_councillors.csv"
WIKIDATA_PATH = ROOT / "data" / "wikidata.json"
CANDIDATES_PATH = ROOT / "data" / "candidates.csv"
CANDIDATE_WIKIDATA_PATH = ROOT / "data" / "wikidata_candidates.json"
FLAGS_PATH = ROOT / "data" / "flags.json"
OUT_PATH = ROOT / "site" / "data" / "data.json"

USER_AGENT = (
    "federal-council-representation/1.0 "
    "(https://github.com/fabianaiolfi/federal-council-representation)"
)

# Gender and age: STAT-TAB (PxWeb API)
PX_TABLE = "px-x-0102030000_101"
PX_API_URL = f"https://www.pxweb.bfs.admin.ch/api/v1/de/{PX_TABLE}/{PX_TABLE}.px"
PX_TABLE_URL = f"https://www.pxweb.bfs.admin.ch/pxweb/de/{PX_TABLE}/-/{PX_TABLE}.px/"

# Language and party: Excel tables, looked up by their BFS table number
BFS_ASSETS_API = "https://dam-api.bfs.admin.ch/hub/api/dam/assets"
LANGUAGE_TABLE = "je-d-01.08.01.01"  # Hauptsprachen seit 1910
LANGUAGE_DETAIL_TABLE = "je-d-01.08.01.02"  # Hauptsprachen nach Kanton (since 2010)
PARTY_TABLE = "je-d-17.02.02.03.01"  # Nationalratswahlen: Stärke der Parteien

# Grossregion: population by canton, censuses 1850-2000 (old .xls file) and
# yearly since 1971 (STAT-TAB). The census is used until 1970.
REGION_CENSUS_TABLE = "su-t-vz15-ch-01"  # Bevölkerungsentwicklung nach Grossregionen und Kantonen
REGION_PX_TABLE = "px-x-0102020000_101"  # Demografische Bilanz nach Kanton
REGION_PX_API_URL = f"https://www.pxweb.bfs.admin.ch/api/v1/de/{REGION_PX_TABLE}/{REGION_PX_TABLE}.px"
REGION_PX_TABLE_URL = f"https://www.pxweb.bfs.admin.ch/pxweb/de/{REGION_PX_TABLE}/-/{REGION_PX_TABLE}.px/"
REGION_PX_FROM = 1971

# Age groups compared. Only adults are compared, from 18: the voting age and
# the minimum age for the Federal Council since 1991 (before: 20).
AGE_GROUPS = [
    {"key": "18-39", "min": 18, "max": 39},
    {"key": "40-64", "min": 40, "max": 64},
    {"key": "65+", "min": 65, "max": None},
]

# Label patterns (several languages, in case the API language is changed).
RE_WOMEN = re.compile(r"^(women|woman|female|frauen|frau|femmes|femme|donne|donna)\b")
RE_MEN = re.compile(r"^(men|man|male|männer|mann|hommes|homme|uomini|uomo)\b")
RE_TOTAL = re.compile(r"total|all ages|insgesamt|tous|totale")

# --- Councillors' party: CSV names -> the party names used by the BFS ----------
PARTY_TO_BFS = {
    "freis.": "FDP",  # Freisinnige, today FDP.Die Liberalen
    "FDP": "FDP",
    "FDP.Die Liberalen": "FDP",
    "LP": "LPS",  # Liberale
    "kath.-kons.": "Mitte",  # Katholisch-Konservative -> KCVP -> CVP -> Die Mitte
    "KCVP": "Mitte",
    "SKVP": "Mitte",
    "CVP": "Mitte",
    "Die Mitte": "Mitte",
    "BGB": "SVP",  # Bauern-, Gewerbe- und Bürgerpartei, today SVP
    "SVP": "SVP",
    "SP": "SP",
    "BDP": "BDP",
}
# Some councillors list two parties (e.g. "SVP" then "BDP"). The second one
# applies from the day the new party was founded nationally.
PARTY_FOUNDED = {"BDP": "2008-11-01"}

# --- Councillors' language ------------------------------------------------------
# Wikidata language names -> the four national languages
LANGUAGE_CODES = {
    "Deutsch": "de", "Schweizerdeutsch": "de", "Schweizer Hochdeutsch": "de",
    "Standarddeutsch": "de", "Französisch": "fr", "Italienisch": "it",
    "Bündnerromanisch": "rm", "Rätoromanisch": "rm", "Rumantsch Grischun": "rm",
}
# Majority language of each canton; all other cantons are German-speaking.
CANTON_LANGUAGE = {
    "Freiburg": "fr", "Genf": "fr", "Jura": "fr", "Neuenburg": "fr",
    "Waadt": "fr", "Wallis": "fr", "Tessin": "it",
}
# Checked by hand where Wikidata is incomplete or misleading.
LANGUAGE_CORRECTIONS = {
    102: "fr",  # Pascal Couchepin: Wikidata only lists German as spoken language
}

# --- Cantons and Grossregionen ----------------------------------------------------
# The cantons by their ISO 3166-2 code (without "CH-") and German name.
CANTONS = {
    "ZH": "Zürich", "BE": "Bern", "LU": "Luzern", "UR": "Uri", "SZ": "Schwyz",
    "OW": "Obwalden", "NW": "Nidwalden", "GL": "Glarus", "ZG": "Zug",
    "FR": "Freiburg", "SO": "Solothurn", "BS": "Basel-Stadt", "BL": "Basel-Landschaft",
    "SH": "Schaffhausen", "AR": "Appenzell Ausserrhoden", "AI": "Appenzell Innerrhoden",
    "SG": "St. Gallen", "GR": "Graubünden", "AG": "Aargau", "TG": "Thurgau",
    "TI": "Tessin", "VD": "Waadt", "VS": "Wallis", "NE": "Neuenburg", "GE": "Genf",
    "JU": "Jura",
}
# Other spellings found in the BFS tables (French and Italian names)
CANTON_ALIASES = {
    "Berne": "BE", "Fribourg": "FR", "Genève": "GE", "Neuchâtel": "NE", "Valais": "VS",
    "Vaud": "VD", "Ticino": "TI", "Grigioni": "GR", "Grischun": "GR", "St.Gallen": "SG",
}
# The seven Grossregionen of the BFS (https://www.bfs.admin.ch/asset/de/5933503),
# in the BFS order.
GROSSREGIONEN = {
    "genfersee": ["VD", "VS", "GE"],
    "mittelland": ["BE", "FR", "SO", "NE", "JU"],
    "nordwestschweiz": ["BS", "BL", "AG"],
    "zuerich": ["ZH"],
    "ostschweiz": ["GL", "SH", "AR", "AI", "SG", "GR", "TG"],
    "zentralschweiz": ["LU", "UR", "SZ", "OW", "NW", "ZG"],
    "tessin": ["TI"],
}
REGION_OF = {code: region for region, codes in GROSSREGIONEN.items() for code in codes}


# --- helpers -------------------------------------------------------------------

def http_get(url: str, body: dict | None = None) -> bytes:
    """GET (or POST JSON, if a body is given) a URL and return the raw bytes."""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def http_json(url: str, body: dict | None = None) -> dict:
    # "utf-8-sig" strips the byte-order mark (BOM) that BFS sometimes sends.
    return json.loads(http_get(url, body).decode("utf-8-sig"))


def parse_date(text: str) -> str | None:
    """'16 November 1848' -> '1848-11-16' (ISO 8601). Empty -> None."""
    text = (text or "").strip()
    if not text:
        return None
    return datetime.strptime(text, "%d %B %Y").date().isoformat()


def xlsx_sheet_count(content: bytes) -> int:
    names = zipfile.ZipFile(io.BytesIO(content)).namelist()
    return sum(1 for n in names if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", n))


def xlsx_rows(content: bytes, sheet_number: int = 1) -> list[list]:
    """
    Read one sheet of an Excel file into a list of rows, using only the
    standard library (an .xlsx file is a zip archive of XML files).
    Each row is a list of cell values (str, or None for empty cells).
    """
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    z = zipfile.ZipFile(io.BytesIO(content))
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns):
            shared.append("".join(t.text or "" for t in si.iter(f"{{{ns['m']}}}t")))

    def col_index(ref: str) -> int:  # "AB12" -> 27
        n = 0
        for ch in re.match(r"[A-Z]+", ref).group():
            n = n * 26 + ord(ch) - 64
        return n - 1

    rows = []
    sheet = ET.fromstring(z.read(f"xl/worksheets/sheet{sheet_number}.xml"))
    for row in sheet.iter(f"{{{ns['m']}}}row"):
        cells = {}
        for c in row.findall("m:c", ns):
            v = c.find("m:v", ns)
            value = None if v is None else v.text
            if c.get("t") == "s" and value is not None:
                value = shared[int(value)]
            cells[col_index(c.get("r"))] = value
        rows.append([cells.get(i) for i in range(max(cells, default=-1) + 1)])
    return rows


def ole_stream(content: bytes, name: str) -> bytes:
    """
    One stream (e.g. "Workbook") of an OLE2 compound file, the container of
    old Office files (.xls). The file is a set of sectors; a table (FAT)
    links each sector to the next, a directory names the streams.
    """
    if content[:8] != bytes.fromhex("d0cf11e0a1b11ae1"):
        sys.exit("Not an old Excel file (.xls).")
    sector_size = 1 << struct.unpack_from("<H", content, 30)[0]
    mini_size = 1 << struct.unpack_from("<H", content, 32)[0]
    n_fat, dir_start = struct.unpack_from("<II", content, 44)
    mini_cutoff, mini_fat_start, _, difat_start, n_difat = struct.unpack_from("<IIIII", content, 56)

    def sector(i: int) -> bytes:
        return content[512 + i * sector_size: 512 + (i + 1) * sector_size]

    def numbers(block: bytes) -> tuple:
        return struct.unpack(f"<{len(block) // 4}I", block)

    def chain(start: int, table: list) -> list:
        out = []
        while start < 0xFFFFFFFA:  # end-of-chain and free markers are above
            out.append(start)
            start = table[start]
        return out

    # Where the FAT itself is stored: 109 entries in the header, more in DIFAT sectors
    fat_sectors = list(struct.unpack_from("<109I", content, 76))
    s = difat_start
    for _ in range(n_difat):
        block = numbers(sector(s))
        fat_sectors += block[:-1]
        s = block[-1]
    fat = [n for s in fat_sectors[:n_fat] for n in numbers(sector(s))]

    directory = b"".join(sector(s) for s in chain(dir_start, fat))
    entries = {}
    for off in range(0, len(directory), 128):
        e = directory[off: off + 128]
        name_len = struct.unpack_from("<H", e, 64)[0]
        entry_name = e[: max(0, name_len - 2)].decode("utf-16-le")
        entries.setdefault(entry_name, struct.unpack_from("<II", e, 116))  # start, size
    if name not in entries:
        sys.exit(f"No '{name}' stream in the .xls file.")
    start, size = entries[name]
    if size >= mini_cutoff:
        return b"".join(sector(s) for s in chain(start, fat))[:size]
    # Small streams live in the "mini stream", stored in the root entry
    mini_fat = [n for s in chain(mini_fat_start, fat) for n in numbers(sector(s))]
    root_start = struct.unpack_from("<I", directory, 116)[0]
    mini = b"".join(sector(s) for s in chain(root_start, fat))
    return b"".join(mini[s * mini_size: (s + 1) * mini_size] for s in chain(start, mini_fat))[:size]


def rk_number(rk: int) -> float:
    """A number in Excel's compact RK format (part of a double, or an integer)."""
    if rk & 2:  # 30-bit signed integer
        value = float((rk >> 2) - (1 << 30) if rk & 0x80000000 else rk >> 2)
    else:  # the upper 30 bits of a double
        value = struct.unpack("<d", struct.pack("<Q", (rk & 0xFFFFFFFC) << 32))[0]
    return value / 100 if rk & 1 else value


def xls_rows(content: bytes, sheet_number: int = 1) -> list[list]:
    """
    Read one sheet of an old Excel file (.xls, BIFF8) into a list of rows,
    using only the standard library. Each row is a list of cell values
    (str, float, or None for empty cells). Only what the BFS tables use is
    supported: text, numbers and the cached results of formulas.
    """
    stream = ole_stream(content, "Workbook")
    records, pos = [], 0
    while pos + 4 <= len(stream):
        rtype, length = struct.unpack_from("<HH", stream, pos)
        records.append((rtype, stream[pos + 4: pos + 4 + length]))
        pos += 4 + length

    # Shared strings (record SST), continued in CONTINUE records. A string
    # that runs into the next record continues there after one flags byte.
    strings = []
    for k, (rtype, body) in enumerate(records):
        if rtype != 0x00FC:
            continue
        parts = [body]
        for rtype2, body2 in records[k + 1:]:
            if rtype2 != 0x003C:
                break
            parts.append(body2)
        part, off = 0, 8
        for _ in range(struct.unpack_from("<I", body, 4)[0]):
            if off >= len(parts[part]):
                part, off = part + 1, 0
            buf = parts[part]
            n, flags = struct.unpack_from("<HB", buf, off)
            off += 3
            runs = ext = 0
            if flags & 8:  # rich text: formatting runs after the text
                runs = struct.unpack_from("<H", buf, off)[0]
                off += 2
            if flags & 4:  # Asian phonetic data after the text
                ext = struct.unpack_from("<I", buf, off)[0]
                off += 4
            wide, text = flags & 1, ""
            while True:
                width = 2 if wide else 1
                take = min(n - len(text), (len(buf) - off) // width)
                text += buf[off: off + take * width].decode("utf-16-le" if wide else "latin-1")
                off += take * width
                if len(text) >= n:
                    break
                part, off = part + 1, 1
                buf = parts[part]
                wide = buf[0] & 1
            off += runs * 4 + ext
            while off > len(buf) and part + 1 < len(parts):
                off -= len(buf)
                part += 1
                buf = parts[part]
            strings.append(text)
        break

    # Cells of the sheet (each sheet starts with a BOF record, after the globals)
    cells, sheet = {}, -1
    for rtype, body in records:
        if rtype == 0x0809:  # BOF
            sheet += 1
        elif sheet != sheet_number:
            continue
        elif rtype == 0x000A:  # EOF
            break
        elif rtype == 0x00FD:  # LABELSST: text
            r, c, _, i = struct.unpack_from("<HHHI", body)
            cells[(r, c)] = strings[i]
        elif rtype == 0x0203:  # NUMBER
            r, c, _, v = struct.unpack_from("<HHHd", body)
            cells[(r, c)] = v
        elif rtype == 0x027E:  # RK: one number
            r, c, _, rk = struct.unpack_from("<HHHI", body)
            cells[(r, c)] = rk_number(rk)
        elif rtype == 0x00BD:  # MULRK: several numbers in a row
            r, c = struct.unpack_from("<HH", body)
            for k in range((len(body) - 6) // 6):
                cells[(r, c + k)] = rk_number(struct.unpack_from("<I", body, 4 + k * 6 + 2)[0])
        elif rtype == 0x0006 and body[12:14] != b"\xff\xff":  # FORMULA with a number result
            r, c, _, v = struct.unpack_from("<HHHd", body)
            cells[(r, c)] = v
    if not cells:
        return []
    n_cols = max(c for _, c in cells) + 1
    return [[cells.get((r, c)) for c in range(n_cols)] for r in range(max(r for r, _ in cells) + 1)]


def canton_code(name: str) -> str | None:
    """'Waadt', 'Vaud 2)', 'Bern / Berne' -> 'VD', 'VD', 'BE' (None if unknown)."""
    by_name = {**{v: k for k, v in CANTONS.items()}, **CANTON_ALIASES}
    for part in re.sub(r"\s*\d+\)", "", name).split("/"):  # footnote marks, "a / b"
        code = by_name.get(part.strip())
        if code:
            return code
    return None


def to_number(value) -> float | None:
    """'28.84' -> 28.84; '*' (no candidates), '-> FDP' (merged), '' -> None."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def bfs_table(order_nr: str) -> tuple[bytes, dict]:
    """Download the current edition of a BFS table by its table number."""
    found = http_json(f"{BFS_ASSETS_API}?orderNr={order_nr}&language=de")["data"]
    if not found:
        sys.exit(f"BFS table {order_nr} not found.")
    asset = found[0]
    dam_id = asset["ids"]["damId"]
    info = {
        "source": "Bundesamt für Statistik (BFS)",
        "table": order_nr.replace("je-d-", "T "),
        "tableTitle": asset["description"]["titles"]["main"],
        "url": f"https://www.bfs.admin.ch/asset/de/{dam_id}",
    }
    return http_get(f"{BFS_ASSETS_API}/{dam_id}/master"), info


# --- 1. Federal Council --------------------------------------------------------

def load_councillors() -> list[dict]:
    """Read the CSV and return one clean dict per councillor."""
    councillors = []
    with CSV_PATH.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            canton = row["canton"].strip()
            code = canton_code(canton)
            if code is None:
                sys.exit(f"Unknown canton '{canton}' for {row['full_name']}: add it to CANTON_ALIASES.")
            councillors.append({
                "number": int(row["number"]),
                "name": row["full_name"].strip(),
                "gender": row["gender"].strip(),  # "female" | "male"
                "canton": canton,
                "cantonCode": code,  # "VD"
                "region": REGION_OF[code],  # Grossregion: "genfersee"
                # A few historic entries list two parties on two lines
                # (e.g. "SVP\nBDP" after a party split).
                "party": " / ".join(p.strip() for p in row["party"].splitlines() if p.strip()),
                "electionDate": parse_date(row["election_date"]),
                "leftOfficeDate": parse_date(row["left_office_date"]),
            })
    return councillors


def party_periods(party: str) -> list[dict]:
    """
    'SVP / BDP' -> [{"party": "SVP", "from": None},
                    {"party": "BDP", "from": "2008-11-01"}]
    (party names as used in the BFS election statistics)
    """
    periods = []
    for i, name in enumerate(party.split(" / ")):
        bfs = PARTY_TO_BFS.get(name)
        if bfs is None:
            sys.exit(f"Unknown party '{name}': add it to PARTY_TO_BFS in build_data.py.")
        periods.append({"party": bfs, "from": None if i == 0 else PARTY_FOUNDED[bfs]})
    return periods


def main_language(c: dict, wd: dict) -> str:
    """
    The councillor's main language: their native language on Wikidata; else
    the only national language they speak; else the canton's majority
    language. Hand-checked corrections come first.
    """
    if c["number"] in LANGUAGE_CORRECTIONS:
        return LANGUAGE_CORRECTIONS[c["number"]]
    native = {LANGUAGE_CODES[l] for l in wd.get("nativeLanguages", []) if l in LANGUAGE_CODES}
    spoken = {LANGUAGE_CODES[l] for l in wd.get("spokenLanguages", []) if l in LANGUAGE_CODES}
    if len(native) == 1:
        return native.pop()
    if len(spoken) == 1:
        return spoken.pop()
    return CANTON_LANGUAGE.get(c["canton"], "de")


def add_wikidata(councillors: list[dict]) -> None:
    """Attach birth date, main language, party periods and portrait."""
    wikidata = json.loads(WIKIDATA_PATH.read_text(encoding="utf-8")) if WIKIDATA_PATH.exists() else {}
    for c in councillors:
        wd = wikidata.get(str(c["number"]), {})
        c["birthDate"] = wd.get("birthDate")
        c["language"] = main_language(c, wd)
        c["parties"] = party_periods(c["party"])
        p = wd.get("portrait")
        if p:
            c["portrait"] = {k: p[k] for k in ("image", "source", "author", "license", "licenseUrl")}
    missing = [c["name"] for c in councillors if not c["birthDate"]]
    if missing:
        sys.exit(f"No birth date for: {', '.join(missing)}. Run scripts/fetch_wikidata.py first.")


def load_candidates() -> list[dict]:
    """
    People offered in "Offizielle Kandidierende" (data/candidates.csv). Party and
    language are converted to the names the comparisons use; rows with
    missing or unknown values stop the script with a message.
    """
    if not CANDIDATES_PATH.exists():
        return []
    languages = {**LANGUAGE_CODES, "Andere": "other", "Andere Sprache": "other",
                 **{code: code for code in ("de", "fr", "it", "rm", "other")}}
    candidates = []
    with CANDIDATES_PATH.open(encoding="utf-8", newline="") as f:
        for line, row in enumerate(csv.DictReader(f), start=2):
            row = {k: (v or "").strip() for k, v in row.items()}
            if not any(row.values()):
                continue  # empty line
            where = f"{CANDIDATES_PATH.relative_to(ROOT)}, line {line}"
            if row["gender"] not in ("female", "male"):
                sys.exit(f"{where}: gender must be 'female' or 'male'.")
            if row["language"] not in languages:
                sys.exit(f"{where}: unknown language '{row['language']}' (use de, fr, it, rm or other).")
            birth = row["birth_date"]
            if re.fullmatch(r"\d{4}", birth):
                birth = f"{birth}-07-01"  # only the year is known: assume mid-year
            elif not re.fullmatch(r"\d{4}-\d{2}-\d{2}", birth):
                sys.exit(f"{where}: birth_date must be YYYY-MM-DD or YYYY.")
            if not row["name"] or not row["party"]:
                sys.exit(f"{where}: name and party are required.")
            code = canton_code(row.get("canton", ""))
            if code is None:
                sys.exit(f"{where}: canton missing or unknown (e.g. Zürich, Waadt, Tessin).")
            candidates.append({
                "id": len(candidates) + 1,
                "name": row["name"],
                "gender": row["gender"],
                # historic names (e.g. "CVP") -> party line; others as given
                "party": PARTY_TO_BFS.get(row["party"], row["party"]),
                "language": languages[row["language"]],
                "birthDate": birth,
                "canton": row["canton"],
                "cantonCode": code,
                "region": REGION_OF[code],
            })
    # Portraits (scripts/fetch_wikidata.py)
    wikidata = (json.loads(CANDIDATE_WIKIDATA_PATH.read_text(encoding="utf-8"))
                if CANDIDATE_WIKIDATA_PATH.exists() else {})
    for c in candidates:
        p = wikidata.get(c["name"], {}).get("portrait")
        if p:
            c["portrait"] = {k: p[k] for k in ("image", "source", "author", "license", "licenseUrl")}
    return candidates


def load_flags() -> dict:
    """Canton flags (scripts/fetch_flags.py): source and licence, for the Quellen page."""
    if not FLAGS_PATH.exists():
        return {}
    flags = json.loads(FLAGS_PATH.read_text(encoding="utf-8"))
    return {code: {"canton": CANTONS[code], **{k: f[k] for k in ("image", "source", "author", "license", "licenseUrl")}}
            for code, f in flags.items()}


# --- 2. Gender and age (BFS, PxWeb) --------------------------------------------

def get_gender_and_age() -> tuple[dict, dict]:
    """Population by sex, and adults by age group, for every year."""
    meta = http_json(PX_API_URL)
    variables = meta["variables"]

    def is_sex_var(v):
        texts = [t.lower() for t in v["valueTexts"]]
        return any(RE_MEN.search(t) for t in texts) and any(RE_WOMEN.search(t) for t in texts)

    def is_year_var(v):
        return v.get("time") or all(re.fullmatch(r"\d{4}", c) for c in v["values"])

    year_var = next(v for v in variables if is_year_var(v))
    sex_var = next(v for v in variables if is_sex_var(v))
    age_var = next(v for v in variables if v not in (year_var, sex_var))

    def total_code(v):
        totals = [c for c, t in zip(v["values"], v["valueTexts"]) if RE_TOTAL.search(t.lower())]
        return totals[0] if totals else v["values"][0]

    def query(sexes, ages):
        body = {"query": [
            {"code": year_var["code"], "selection": {"filter": "item", "values": year_var["values"]}},
            {"code": sex_var["code"], "selection": {"filter": "item", "values": sexes}},
            {"code": age_var["code"], "selection": {"filter": "item", "values": ages}},
        ], "response": {"format": "json"}}
        res = http_json(PX_API_URL, body)
        columns = [c["code"] for c in res["columns"]]
        pos = {v["code"]: columns.index(v["code"]) for v in (year_var, sex_var, age_var)}
        return [({k: row["key"][i] for k, i in pos.items()}, int(row["values"][0])) for row in res["data"]]

    year_label = dict(zip(year_var["values"], year_var["valueTexts"]))
    sex_label = dict(zip(sex_var["values"], sex_var["valueTexts"]))

    # Gender: all sexes, all ages together
    gender: dict[str, dict] = {}
    for key, value in query(sex_var["values"], [total_code(age_var)]):
        year = year_label[key[year_var["code"]]]
        label = sex_label[key[sex_var["code"]]].lower()
        if RE_WOMEN.search(label):
            gender.setdefault(year, {})["female"] = value
        elif RE_MEN.search(label):
            gender.setdefault(year, {})["male"] = value
    gender = {y: gender[y] for y in sorted(gender) if {"female", "male"} <= gender[y].keys()}

    # Age: both sexes together, every single age ("20 Jahre" -> 20), grouped
    age_of = {}
    for code, text in zip(age_var["values"], age_var["valueTexts"]):
        m = re.match(r"(\d+)", text)
        if m:
            age_of[code] = int(m.group(1))
    age: dict[str, dict] = {}
    for key, value in query([total_code(sex_var)], list(age_of)):
        years_old = age_of[key[age_var["code"]]]
        group = next((g["key"] for g in AGE_GROUPS
                      if years_old >= g["min"] and (g["max"] is None or years_old <= g["max"])), None)
        if group:
            year = year_label[key[year_var["code"]]]
            counts = age.setdefault(year, {g["key"]: 0 for g in AGE_GROUPS})
            counts[group] += value
    age = dict(sorted(age.items()))

    if not gender or not age:
        sys.exit("Could not read gender or age from the BFS response.")
    info = {
        "source": "Bundesamt für Statistik (BFS)",
        "table": PX_TABLE,
        "tableTitle": meta.get("title", ""),
        "url": PX_TABLE_URL,
    }
    return (
        {**info, "years": gender},  # {"1860": {"female": …, "male": …}, …}
        {**info, "groups": AGE_GROUPS, "years": age},  # {"1860": {"20-39": …, …}, …}
    )


# --- 2b. Grossregion (BFS: census .xls, then PxWeb) -----------------------------------

def get_regions() -> dict:
    """
    Population of the seven Grossregionen: the censuses 1850-1970 (from the
    table of all censuses 1850-2000), then every year from 1971 (permanent
    resident population on 31 December). Both are read by canton and summed
    per Grossregion, so every source uses the same definition of the regions.
    """
    by_year: dict[str, dict] = {}

    def add(year: str, code: str, persons: float) -> None:
        counts = by_year.setdefault(year, {region: 0 for region in GROSSREGIONEN})
        counts[REGION_OF[code]] += int(persons)

    # Censuses: a header row with the census years, then one row per canton
    # (the canton name in the second column; the first column names regions)
    content, census_info = bfs_table(REGION_CENSUS_TABLE)
    rows = xls_rows(content)
    header = next(r for r in rows if sum(isinstance(v, float) and 1840 < v < 2100 for v in r) >= 10)
    years = {i: str(int(v)) for i, v in enumerate(header) if isinstance(v, float) and 1840 < v < REGION_PX_FROM}
    seen = set()
    for r in rows:
        if len(r) < 2 or not isinstance(r[1], str):
            continue
        code = canton_code(r[1])
        if code is None:
            sys.exit(f"Census table: unknown canton '{r[1]}': add it to CANTON_ALIASES.")
        seen.add(code)
        for i, year in years.items():
            add(year, code, r[i])
    if seen != set(CANTONS):
        sys.exit(f"Census table: cantons missing: {sorted(set(CANTONS) - seen)}")

    # Every year since 1971: STAT-TAB, population at the end of the year
    meta = http_json(REGION_PX_API_URL)
    var = {v["code"]: v for v in meta["variables"]}

    def pick(code: str, text_test) -> list:
        v = var[code]
        return [c for c, t in zip(v["values"], v["valueTexts"]) if text_test(t)]

    year_var, canton_var, *other_vars = list(var)
    selection = {year_var: var[year_var]["values"], canton_var: var[canton_var]["values"]}
    for code in other_vars:
        texts = var[code]["valueTexts"]
        if any(t.startswith("Bestand am 31") for t in texts):
            selection[code] = pick(code, lambda t: t.startswith("Bestand am 31"))
        else:
            selection[code] = pick(code, lambda t: RE_TOTAL.search(t.lower()))[:1]
    body = {"query": [{"code": c, "selection": {"filter": "item", "values": v}} for c, v in selection.items()],
            "response": {"format": "json"}}
    res = http_json(REGION_PX_API_URL, body)
    columns = [c["code"] for c in res["columns"]]
    year_label = dict(zip(var[year_var]["values"], var[year_var]["valueTexts"]))
    canton_label = dict(zip(var[canton_var]["values"], var[canton_var]["valueTexts"]))
    for row in res["data"]:
        code = canton_code(canton_label[row["key"][columns.index(canton_var)]])
        value = row["values"][0]
        if code is None or not value.replace(".", "").isdigit():  # Schweiz, Ohne Angabe
            continue
        add(year_label[row["key"][columns.index(year_var)]], code, float(value))

    if not any(int(y) >= REGION_PX_FROM for y in by_year):
        sys.exit("Could not read the population by canton from the BFS response.")
    return {
        **census_info,
        "regions": list(GROSSREGIONEN),
        "years": dict(sorted(by_year.items())),  # {"1850": {"genfersee": 345280, …}, …}
        "annual": {  # the second source, for the list of sources
            "source": "Bundesamt für Statistik (BFS)",
            "table": REGION_PX_TABLE,
            "tableTitle": meta.get("title", ""),
            "url": REGION_PX_TABLE_URL,
        },
    }


# --- 3. Language (BFS, Excel) ---------------------------------------------------

def get_languages() -> dict:
    """
    Main languages of the permanent resident population, in %. Since 2010
    people can name several main languages, so the shares add up to more
    than 100 %; the web app compares the relative shares.
    """
    content, info = bfs_table(LANGUAGE_TABLE)
    rows = xlsx_rows(content)

    # Header row: find the column of each language by its name.
    header = next(r for r in rows if any(isinstance(v, str) and v.startswith("Deutsch") for v in r))
    columns = {}
    for i, v in enumerate(header):
        name = (v or "").strip()
        for prefix, key in (("Deutsch", "de"), ("Französisch", "fr"), ("Italienisch", "it"),
                            ("Rätoromanisch", "rm"), ("Andere", "other")):
            if name.startswith(prefix):
                columns[key] = i

    # Rows: the first block ("Total") lists every year; the next block
    # ("Schweizer/-innen") starts with a text label, where we stop.
    years, in_total = {}, False
    for r in rows:
        first = (r[0] or "").strip() if r else ""
        if first.startswith("Total"):
            in_total = True
        elif in_total and re.fullmatch(r"\d{4}", first):
            years[first] = {k: round(to_number(r[i]) or 0, 3) for k, i in columns.items()}
        elif in_total and first and not first.isdigit():
            break
    if not years:
        sys.exit("Could not read the language table.")
    return {**info, "years": years}  # {"1910": {"de": 69.1, "fr": 21.1, …}, …}


def get_other_languages() -> dict:
    """
    Which languages make up "other languages" (non-national main languages),
    in number of people aged 15+, for every year since 2010. One sheet per
    year; the "Total" row is Switzerland as a whole. Only used to show what
    "Andere Sprachen" contains.
    """
    content, info = bfs_table(LANGUAGE_DETAIL_TABLE)
    national = ("Deutsch", "Französisch", "Italienisch", "Rätoromanisch", "Total")
    years = {}
    for n in range(1, xlsx_sheet_count(content) + 1):
        rows = xlsx_rows(content, n)
        year = re.search(r"(\d{4})\s*$", (rows[0][0] or "").strip())
        header = next((r for r in rows if any(v and str(v).startswith("Deutsch") for v in r)), None)
        total = next((r for r in rows if r and (r[0] or "").strip() == "Total"), None)
        if not (year and header and total):
            continue
        counts = {}
        for i, name in enumerate(header):
            name = (name or "").strip()
            if name and not name.startswith(national):
                value = to_number(total[i] if i < len(total) else None)
                if value:
                    counts[name] = round(value)
        years[year.group(1)] = counts
    return {**info, "years": dict(sorted(years.items()))}  # {"2024": {"Englisch": 552364, …}}


# --- 4. Party (BFS, Excel) ------------------------------------------------------

def get_parties() -> dict:
    """Party strength (share of the vote) in every National Council election."""
    content, info = bfs_table(PARTY_TABLE)
    rows = xlsx_rows(content)

    # Header row: "Partei", 1919, 1922, … ("1939 2": footnote marker)
    header = next(r for r in rows if r and (r[0] or "").strip() == "Partei")
    year_cols = {i: re.match(r"\d{4}", v).group() for i, v in enumerate(header)
                 if i > 0 and v and re.match(r"\d{4}", v)}

    elections: dict[str, dict] = {y: {} for y in year_cols.values()}
    for r in rows[rows.index(header) + 1:]:
        label = re.sub(r"\s+\d+$", "", (r[0] or "").strip())  # "FDP 3" -> "FDP"
        if not label or label.startswith("Total"):
            break
        # CVP (until 2019) and Die Mitte (from 2023) are the same party line.
        party = "Mitte" if label in ("CVP", "Die Mitte") else label
        for i, year in year_cols.items():
            share = to_number(r[i] if i < len(r) else None)
            if share:
                elections[year][party] = round(elections[year].get(party, 0) + share, 3)
    return {**info, "elections": elections}  # {"1919": {"FDP": 28.8, …}, …}


# --- main ------------------------------------------------------------------------

def main() -> None:
    councillors = load_councillors()
    add_wikidata(councillors)
    print(f"Read {len(councillors)} councillors (+ birth dates, languages, portraits)")
    candidates = load_candidates()
    print(f"Read {len(candidates)} people for 'Offizielle Kandidierende' from {CANDIDATES_PATH.relative_to(ROOT)}")

    gender, age = get_gender_and_age()
    print(f"Gender and age: {len(gender['years'])} years ({min(gender['years'])}-{max(gender['years'])})")
    language = get_languages()
    language["other"] = get_other_languages()
    print(f"Language: {len(language['years'])} years ({min(language['years'])}-{max(language['years'])}), "
          f"other languages in detail: {len(language['other']['years'])} years")
    party = get_parties()
    print(f"Party: {len(party['elections'])} elections ({min(party['elections'])}-{max(party['elections'])})")
    region = get_regions()
    print(f"Grossregion: {len(region['years'])} years ({min(region['years'])}-{max(region['years'])})")

    output = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "gender": gender,
        "age": age,
        "language": language,
        "party": party,
        "region": region,
        "councillors": councillors,
        "candidates": candidates,
        "flags": load_flags(),
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
