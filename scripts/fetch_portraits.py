#!/usr/bin/env python3
"""
Download a portrait of every Federal Councillor from Wikimedia Commons.

    python3 scripts/fetch_portraits.py

Steps:
1. Ask Wikidata for everyone who held the position "member of the Swiss
   Federal Council" (Q11811941), with their portrait image (property P18).
2. Match these people to data/all_federal_councillors.csv by name.
3. Ask Wikimedia Commons for a small version of each image plus its
   author and licence (needed for the credits on the page).
4. Save the images as site/img/<number>.<ext> and the credits as
   data/portraits.json. build_data.py then adds them to site/data/data.json.

The images are stored in this repository (not loaded from Wikimedia when
someone visits the page): faster, works offline, and visitors' browsers
don't contact a third party.

Only the Python standard library is used.
"""

from __future__ import annotations

import html
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

from build_data import load_councillors  # same folder

ROOT = Path(__file__).resolve().parent.parent
IMG_DIR = ROOT / "site" / "img"
OUT_PATH = ROOT / "data" / "portraits.json"

# Wikimedia asks scripts to identify themselves with a way to find out more.
USER_AGENT = (
    "federal-council-representation/1.0 "
    "(https://github.com/fabianaiolfi/federal-council-representation)"
)
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
POSITION = "Q11811941"  # Wikidata: member of the Swiss Federal Council
THUMB_WIDTH = 250  # px; a standard Wikimedia thumbnail size

# If a name in the CSV doesn't match Wikidata, map the CSV number to the
# Wikidata item here, e.g. {42: "Q123456"}.
MANUAL_MATCHES: dict[int, str] = {
    6: "Q55035119",  # Friedrich Frey-Herosé (Wikidata: "Frei-Herosé")
    103: "Q464007",  # Ruth Metzler-Arnold (Wikidata: "Ruth Metzler")
}


# --- helpers ---------------------------------------------------------------------

def get(url: str, params: dict | None = None) -> bytes:
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def normalise(name: str) -> str:
    """'Élisabeth Baume-Schneider' -> 'elisabethbaumeschneider'."""
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", plain.lower())


def plain_text(value: str) -> str:
    """Commons metadata often contains HTML: '<a href=…>Name</a>' -> 'Name'."""
    text = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


# --- 1. Wikidata: who held the position, and their image ----------------------------

def wikidata_members() -> list[dict]:
    query = f"""
        SELECT ?person ?personLabel (MIN(?img) AS ?image) WHERE {{
          ?person p:P39/ps:P39 wd:{POSITION} .
          OPTIONAL {{ ?person wdt:P18 ?img }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "de,en". }}
        }}
        GROUP BY ?person ?personLabel
    """
    data = json.loads(get(WIKIDATA_SPARQL, {"query": query, "format": "json"}))
    members = []
    for row in data["results"]["bindings"]:
        image_url = row.get("image", {}).get("value")
        members.append({
            "wikidata": row["person"]["value"].rsplit("/", 1)[1],
            "label": row["personLabel"]["value"],
            # ".../Special:FilePath/Jonas%20Furrer.jpg" -> "Jonas Furrer.jpg"
            "file": urllib.parse.unquote(image_url.rsplit("/", 1)[1]) if image_url else None,
        })
    return members


# --- 2. Commons: thumbnail URL, author and licence -----------------------------------

def commons_info(files: list[str]) -> dict[str, dict]:
    """Image info for up to 50 files per request, keyed by file name."""
    info = {}
    for i in range(0, len(files), 50):
        batch = files[i : i + 50]
        data = json.loads(get(COMMONS_API, {
            "action": "query",
            "format": "json",
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "iiurlwidth": THUMB_WIDTH,
            "titles": "|".join(f"File:{f}" for f in batch),
        }))
        # Commons may normalise titles (e.g. underscores); map them back.
        renamed = {n["to"]: n["from"] for n in data["query"].get("normalized", [])}
        for page in data["query"]["pages"].values():
            if "imageinfo" not in page:
                continue
            title = renamed.get(page["title"], page["title"])
            ii = page["imageinfo"][0]
            meta = ii.get("extmetadata", {})
            info[title.removeprefix("File:")] = {
                "thumb": ii.get("thumburl") or ii["url"],
                "source": ii["descriptionurl"],
                "author": plain_text(meta.get("Artist", {}).get("value", "")) or None,
                "license": plain_text(meta.get("LicenseShortName", {}).get("value", "")) or None,
                "licenseUrl": meta.get("LicenseUrl", {}).get("value"),
            }
        time.sleep(1)  # be polite to the API
    return info


# --- main ------------------------------------------------------------------------------

def main() -> None:
    councillors = load_councillors()
    members = wikidata_members()
    print(f"Wikidata: {len(members)} people held the position")

    by_name = {normalise(m["label"]): m for m in members}
    by_id = {m["wikidata"]: m for m in members}

    matched, missing = {}, []
    for c in councillors:
        m = by_id.get(MANUAL_MATCHES.get(c["number"], "")) or by_name.get(normalise(c["name"]))
        if m and m["file"]:
            matched[c["number"]] = m
        else:
            missing.append(c)

    info = commons_info(sorted({m["file"] for m in matched.values()}))

    IMG_DIR.mkdir(parents=True, exist_ok=True)
    portraits = {}
    for number, m in sorted(matched.items()):
        meta = info.get(m["file"])
        if not meta:
            missing.append(next(c for c in councillors if c["number"] == number))
            continue
        ext = Path(urllib.parse.urlparse(meta["thumb"]).path).suffix.lower() or ".jpg"
        path = IMG_DIR / f"{number}{ext}"
        if not path.exists():  # rerunning only downloads what is new
            path.write_bytes(get(meta["thumb"]))
            time.sleep(0.5)
        portraits[str(number)] = {
            "image": f"img/{path.name}",  # relative to site/
            "wikidata": m["wikidata"],
            "file": m["file"],
            "source": meta["source"],
            "author": meta["author"],
            "license": meta["license"],
            "licenseUrl": meta["licenseUrl"],
        }

    OUT_PATH.write_text(json.dumps(portraits, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(portraits)} portraits to {IMG_DIR.relative_to(ROOT)}/")
    print(f"Wrote credits to {OUT_PATH.relative_to(ROOT)}")
    if missing:
        print("No portrait found for:")
        for c in missing:
            print(f"  {c['number']}: {c['name']}  (add to MANUAL_MATCHES if Wikidata has one)")
    print("Now run: python3 scripts/build_data.py")


if __name__ == "__main__":
    main()
