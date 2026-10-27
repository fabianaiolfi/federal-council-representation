#!/usr/bin/env python3
"""
Build the data file used by the web app: site/data/data.json

It combines two sources:

1. data/all_federal_councillors.csv
   Every Federal Councillor since 1848 (name, gender, canton, party, dates).
   All councillors are exported; the web app itself decides who is "current"
   based on the visitor's date (so a councillor with a future
   `left_office_date` drops out automatically on that day).

2. Federal Statistical Office (FSO / BFS), STAT-TAB PxWeb API
   Table px-x-0102030000_101
   "Ständige Wohnbevölkerung nach Geschlecht und Alter, 1860-..."
   We take the total over all ages for women and men in one year.

Usage
    python3 scripts/build_data.py           # latest year available at BFS
    python3 scripts/build_data.py 2020      # a specific year

Only the Python standard library is used, so no `pip install` is needed.
This is a Python port of the R script swiss_gender_share.R: variables are
detected by their content (labels), not by hard-coded codes, so the script
keeps working if BFS renumbers codes. Note that the year codes in this table
are indices ("0" = 1860, "165" = 2025), which is why years are matched on
their labels.
"""

from __future__ import annotations

import csv
import json
import re
import sys
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

# --- paths & constants ---------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "all_federal_councillors.csv"
OUT_PATH = ROOT / "site" / "data" / "data.json"

BFS_TABLE = "px-x-0102030000_101"
BFS_API_URL = (
    "https://www.pxweb.bfs.admin.ch/api/v1/de/"
    f"{BFS_TABLE}/{BFS_TABLE}.px"
)
# Human-readable page of the same table, linked in the web app's footer.
BFS_TABLE_URL = (
    "https://www.pxweb.bfs.admin.ch/pxweb/de/"
    f"{BFS_TABLE}/-/{BFS_TABLE}.px/"
)

# Label patterns (several languages, in case the API language is changed).
RE_WOMEN = re.compile(r"^(women|woman|female|frauen|frau|femmes|femme|donne|donna)\b")
RE_MEN = re.compile(r"^(men|man|male|männer|mann|hommes|homme|uomini|uomo)\b")
RE_TOTAL = re.compile(r"total|all ages|insgesamt|tous|totale")


# --- helpers -------------------------------------------------------------------

def http_json(url: str, body: dict | None = None) -> dict:
    """GET (or POST, if a body is given) a URL and parse the JSON response."""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "federal-council-representation/build_data.py",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        # "utf-8-sig" strips the byte-order mark (BOM) that BFS sometimes sends.
        return json.loads(resp.read().decode("utf-8-sig"))


def parse_date(text: str) -> str | None:
    """'16 November 1848' -> '1848-11-16' (ISO 8601). Empty -> None."""
    text = (text or "").strip()
    if not text:
        return None
    return datetime.strptime(text, "%d %B %Y").date().isoformat()


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


# --- 2. Population by sex (BFS) -------------------------------------------------

def get_population_by_sex(year: int | None = None) -> dict:
    """Return the permanent resident population by sex for one year."""
    meta = http_json(BFS_API_URL)
    variables = meta["variables"]

    def is_sex_var(v):
        texts = [t.lower() for t in v["valueTexts"]]
        return any(RE_MEN.search(t) for t in texts) and any(RE_WOMEN.search(t) for t in texts)

    def is_year_var(v):
        return v.get("time") or all(re.fullmatch(r"\d{4}", c) for c in v["values"])

    year_var = next(v for v in variables if is_year_var(v))
    sex_var = next(v for v in variables if is_sex_var(v))

    # Resolve the year: labels are "1860" ... "2025", codes are indices.
    available = {int(t): code for code, t in zip(year_var["values"], year_var["valueTexts"])}
    if year is None:
        year = max(available)
    if year not in available:
        sys.exit(f"Year {year} not available. Available: {min(available)}-{max(available)}.")

    # Query: chosen year, all sexes, "total" for every other variable (age).
    query = []
    for v in variables:
        if v["code"] == year_var["code"]:
            values = [available[year]]
        elif v["code"] == sex_var["code"]:
            values = v["values"]
        else:
            totals = [c for c, t in zip(v["values"], v["valueTexts"]) if RE_TOTAL.search(t.lower())]
            values = [totals[0] if totals else v["values"][0]]
        query.append({"code": v["code"], "selection": {"filter": "item", "values": values}})

    res = http_json(BFS_API_URL, {"query": query, "response": {"format": "json"}})

    # Each data row: key = [year code, sex code, age code], values = [population]
    sex_pos = [c["code"] for c in res["columns"]].index(sex_var["code"])
    sex_label = dict(zip(sex_var["values"], sex_var["valueTexts"]))
    women = men = None
    for row in res["data"]:
        label = sex_label[row["key"][sex_pos]].lower()
        value = int(row["values"][0])
        if RE_WOMEN.search(label):
            women = value
        elif RE_MEN.search(label):
            men = value
    if women is None or men is None:
        sys.exit("Could not find values for women and men in the BFS response.")

    return {
        "year": year,
        "women": women,
        "men": men,
        "source": "Bundesamt für Statistik (BFS), STATPOP",
        "table": BFS_TABLE,
        "tableTitle": meta.get("title", ""),
        "url": BFS_TABLE_URL,
    }


# --- main ------------------------------------------------------------------------

def main() -> None:
    year = int(sys.argv[1]) if len(sys.argv) > 1 else None

    councillors = load_councillors()
    print(f"Read {len(councillors)} councillors from {CSV_PATH.relative_to(ROOT)}")

    population = get_population_by_sex(year)
    total = population["women"] + population["men"]
    print(
        f"BFS {population['year']}: women {population['women']:,} "
        f"({100 * population['women'] / total:.2f} %), "
        f"men {population['men']:,} ({100 * population['men'] / total:.2f} %)"
    )

    output = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "population": population,
        "councillors": councillors,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
