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

3. Federal Statistical Office (FSO / BFS), the population side of every
   comparison. Each comparison uses the population of the time:
   - Gender and age: STAT-TAB PxWeb table px-x-0102030000_101
     "Ständige Wohnbevölkerung nach Geschlecht und Alter", every year
     since 1860. Age is grouped as 20-39, 40-64 and 65+ (adults only).
   - Language: table T 01.08.01.01 "Hauptsprachen seit 1910"
     (censuses until 2000, yearly since 2010).
   - Party: table T 17.02.02.03.01 "Nationalratswahlen: Stärke der
     Parteien" (every National Council election since 1919).
   The two tables are Excel files, downloaded through the BFS asset API by
   their table number, so a new edition is picked up automatically.

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
PARTY_TABLE = "je-d-17.02.02.03.01"  # Nationalratswahlen: Stärke der Parteien

# Age groups compared (adults: the Council's members are always adults).
# These are the BFS's usual broad age groups for the adult population.
AGE_GROUPS = [
    {"key": "20-39", "min": 20, "max": 39},
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


def xlsx_rows(content: bytes) -> list[list]:
    """
    Read the first sheet of an Excel file into a list of rows, using only the
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
    sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
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
            councillors.append({
                "number": int(row["number"]),
                "name": row["full_name"].strip(),
                "gender": row["gender"].strip(),  # "female" | "male"
                "canton": row["canton"].strip(),
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

    gender, age = get_gender_and_age()
    print(f"Gender and age: {len(gender['years'])} years ({min(gender['years'])}-{max(gender['years'])})")
    language = get_languages()
    print(f"Language: {len(language['years'])} years ({min(language['years'])}-{max(language['years'])})")
    party = get_parties()
    print(f"Party: {len(party['elections'])} elections ({min(party['elections'])}-{max(party['elections'])})")

    output = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "gender": gender,
        "age": age,
        "language": language,
        "party": party,
        "councillors": councillors,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
