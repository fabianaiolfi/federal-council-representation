#!/usr/bin/env python3
"""
Build the data file used by the web app: site/data/data.json

It combines two sources:

1. data/all_federal_councillors.csv
   Every Federal Councillor since 1848 (name, gender, canton, party, dates).
   All councillors are exported; the web app itself works out the
   successive compositions of the Council and which one is current.

2. Federal Statistical Office (FSO / BFS), STAT-TAB PxWeb API
   Table px-x-0102030000_101
   "Ständige Wohnbevölkerung nach Geschlecht und Alter, 1860-..."
   We take the total over all ages for women and men, for every year,
   so each historical Council can be compared with the population of
   its own time.

3. data/portraits.json (optional), written by scripts/fetch_portraits.py:
   image path, author and licence of each councillor's portrait.

Usage
    python3 scripts/build_data.py

Only the Python standard library is used, so no `pip install` is needed.
This is a Python port of the R script swiss_gender_share.R: variables are
detected by their content (labels), not by hard-coded codes, so the script
keeps working if BFS renumbers codes. Note that the year codes in this table
are indices ("0" = 1860, "165" = 2025), which is why years are read from
their labels.
"""

from __future__ import annotations

import csv
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# --- paths & constants ---------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "all_federal_councillors.csv"
PORTRAITS_PATH = ROOT / "data" / "portraits.json"
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


def add_portraits(councillors: list[dict]) -> int:
    """Attach portrait + credits from data/portraits.json, if it exists."""
    if not PORTRAITS_PATH.exists():
        return 0
    portraits = json.loads(PORTRAITS_PATH.read_text(encoding="utf-8"))
    for c in councillors:
        p = portraits.get(str(c["number"]))
        if p:
            c["portrait"] = {
                "image": p["image"],
                "source": p["source"],
                "author": p["author"],
                "license": p["license"],
                "licenseUrl": p["licenseUrl"],
            }
    return sum(1 for c in councillors if "portrait" in c)


# --- 2. Population by sex (BFS) -------------------------------------------------

def get_population_by_sex() -> dict:
    """Return the permanent resident population by sex for every year."""
    meta = http_json(BFS_API_URL)
    variables = meta["variables"]

    def is_sex_var(v):
        texts = [t.lower() for t in v["valueTexts"]]
        return any(RE_MEN.search(t) for t in texts) and any(RE_WOMEN.search(t) for t in texts)

    def is_year_var(v):
        return v.get("time") or all(re.fullmatch(r"\d{4}", c) for c in v["values"])

    year_var = next(v for v in variables if is_year_var(v))
    sex_var = next(v for v in variables if is_sex_var(v))

    # Query: all years, all sexes, "total" for every other variable (age).
    query = []
    for v in variables:
        if v["code"] in (year_var["code"], sex_var["code"]):
            values = v["values"]
        else:
            totals = [c for c, t in zip(v["values"], v["valueTexts"]) if RE_TOTAL.search(t.lower())]
            values = [totals[0] if totals else v["values"][0]]
        query.append({"code": v["code"], "selection": {"filter": "item", "values": values}})

    res = http_json(BFS_API_URL, {"query": query, "response": {"format": "json"}})

    # Each data row: key = [year code, sex code, age code], values = [population]
    columns = [c["code"] for c in res["columns"]]
    year_pos = columns.index(year_var["code"])
    sex_pos = columns.index(sex_var["code"])
    year_label = dict(zip(year_var["values"], year_var["valueTexts"]))
    sex_label = dict(zip(sex_var["values"], sex_var["valueTexts"]))

    years: dict[str, dict] = {}
    for row in res["data"]:
        year = year_label[row["key"][year_pos]]
        label = sex_label[row["key"][sex_pos]].lower()
        value = int(row["values"][0])
        if RE_WOMEN.search(label):
            years.setdefault(year, {})["women"] = value
        elif RE_MEN.search(label):
            years.setdefault(year, {})["men"] = value

    # Keep only complete years, in chronological order.
    years = {y: years[y] for y in sorted(years) if {"women", "men"} <= years[y].keys()}
    if not years:
        sys.exit("Could not find values for women and men in the BFS response.")

    return {
        "source": "Bundesamt für Statistik (BFS)",
        "table": BFS_TABLE,
        "tableTitle": meta.get("title", ""),
        "url": BFS_TABLE_URL,
        "years": years,  # {"1860": {"women": …, "men": …}, …}
    }


# --- main ------------------------------------------------------------------------

def main() -> None:
    councillors = load_councillors()
    print(f"Read {len(councillors)} councillors from {CSV_PATH.relative_to(ROOT)}")
    print(f"Added {add_portraits(councillors)} portraits from {PORTRAITS_PATH.relative_to(ROOT)}")

    population = get_population_by_sex()
    years = population["years"]
    first, last = min(years), max(years)
    w, m = years[last]["women"], years[last]["men"]
    print(f"BFS population by sex: {len(years)} years ({first}-{last})")
    print(f"  {last}: women {w:,} ({100 * w / (w + m):.2f} %), men {m:,} ({100 * m / (w + m):.2f} %)")

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
