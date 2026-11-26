#!/usr/bin/env python3
"""
Collect data about every Federal Councillor from Wikidata: birth date,
languages and portrait (downloaded from Wikimedia Commons).

    python3 scripts/fetch_wikidata.py

Steps:
1. Ask Wikidata for everyone who held the position "member of the Swiss
   Federal Council" (Q11811941), with their birth date (property P569),
   native language (P103), languages spoken (P1412) and portrait (P18).
2. Match these people to data/all_federal_councillors.csv by name.
3. Ask Wikimedia Commons for a small version of each image plus its
   author and licence (needed for the credits on the page).
4. Save the images as site/img/<number>.<ext> and everything else as
   data/wikidata.json. build_data.py then adds it to site/data/data.json
   (and works out each councillor's main language from it).
5. The same for the portraits of the people in data/candidates.csv
   ("Offizielle Kandidierende"): site/img/candidates/<name>.jpg and
   data/wikidata_candidates.json.
6. The same for the current members of parliament (the parlament.ch files,
   "Passende Parlamentarier:innen"): site/img/parliament/<name>.jpg and
   data/wikidata_parliament.json.

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
OUT_PATH = ROOT / "data" / "wikidata.json"

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


# --- 1. Wikidata: who held the position, birth date, languages, image ----------------

def wikidata_members() -> list[dict]:
    # Languages are returned with their German names, e.g. "Französisch".
    query = f"""
        SELECT ?person ?personLabel (MIN(?img) AS ?image) (MIN(?born) AS ?birth)
               (GROUP_CONCAT(DISTINCT ?nativeName; separator="|") AS ?native)
               (GROUP_CONCAT(DISTINCT ?spokenName; separator="|") AS ?spoken)
        WHERE {{
          ?person p:P39/ps:P39 wd:{POSITION} .
          OPTIONAL {{ ?person wdt:P18 ?img }}
          OPTIONAL {{ ?person wdt:P569 ?born }}
          OPTIONAL {{ ?person wdt:P103 ?n . ?n rdfs:label ?nativeName . FILTER(LANG(?nativeName) = "de") }}
          OPTIONAL {{ ?person wdt:P1412 ?s . ?s rdfs:label ?spokenName . FILTER(LANG(?spokenName) = "de") }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "de,en". }}
        }}
        GROUP BY ?person ?personLabel
    """
    data = json.loads(get(WIKIDATA_SPARQL, {"query": query, "format": "json"}))
    members = []
    for row in data["results"]["bindings"]:
        image_url = row.get("image", {}).get("value")
        split = lambda key: sorted(filter(None, row.get(key, {}).get("value", "").split("|")))
        members.append({
            "wikidata": row["person"]["value"].rsplit("/", 1)[1],
            "label": row["personLabel"]["value"],
            # "1848-02-03T00:00:00Z" -> "1848-02-03"
            "birthDate": row.get("birth", {}).get("value", "")[:10] or None,
            "nativeLanguages": split("native"),
            "spokenLanguages": split("spoken"),
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


# --- Candidates (data/candidates.csv): portraits ---------------------------------------

def slug(name: str) -> str:
    """'Céline Amaudruz' -> 'celine-amaudruz' (file name of the portrait)."""
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]+", "-", plain.lower()).strip("-")


def fetch_candidate_portraits() -> None:
    """
    Portraits of the people in data/candidates.csv ("Offizielle
    Kandidierende"). They are found on Wikidata by name; if several people
    share the name, the one with the birth date from the CSV is taken.
    Saved as site/img/candidates/<name>.jpg, credits in
    data/wikidata_candidates.json (keyed by name). Existing images are kept,
    so a photo cropped by hand stays (pierre-alain-schnegg.jpg: head and
    shoulders cut from the event photo on Wikidata, which is CC0).
    """
    from build_data import load_candidates  # same folder

    candidates = load_candidates()
    if not candidates:
        return
    labels = " ".join(f'"{c["name"]}"@{lang}' for c in candidates for lang in ("de", "fr", "en"))
    query = f"""
        SELECT ?person ?label ?img ?born WHERE {{
          VALUES ?label {{ {labels} }}
          ?person rdfs:label ?label ; wdt:P31 wd:Q5 .
          OPTIONAL {{ ?person wdt:P18 ?img }}
          OPTIONAL {{ ?person wdt:P569 ?born }}
        }}
    """
    data = json.loads(get(WIKIDATA_SPARQL, {"query": query, "format": "json"}))
    found: dict[str, list[dict]] = {}
    for row in data["results"]["bindings"]:
        image_url = row.get("img", {}).get("value")
        found.setdefault(row["label"]["value"], []).append({
            "wikidata": row["person"]["value"].rsplit("/", 1)[1],
            "birthDate": row.get("born", {}).get("value", "")[:10],
            "file": urllib.parse.unquote(image_url.rsplit("/", 1)[1]) if image_url else None,
        })

    chosen, missing = {}, []
    for c in candidates:
        people = [p for p in found.get(c["name"], []) if p["file"]]
        same_birth = [p for p in people if p["birthDate"] == c["birthDate"]]
        person = (same_birth or people or [None])[0]
        if person:
            chosen[c["name"]] = person
        else:
            missing.append(c["name"])

    info = commons_info(sorted({p["file"] for p in chosen.values()}))
    out_dir = IMG_DIR / "candidates"
    out_dir.mkdir(parents=True, exist_ok=True)
    result = {}
    for name, person in chosen.items():
        meta = info.get(person["file"])
        if not meta:
            missing.append(name)
            continue
        ext = Path(urllib.parse.urlparse(meta["thumb"]).path).suffix.lower() or ".jpg"
        path = out_dir / f"{slug(name)}{ext}"
        if not path.exists():
            path.write_bytes(get(meta["thumb"]))
            time.sleep(0.5)
        result[name] = {
            "wikidata": person["wikidata"],
            "portrait": {
                "image": f"img/candidates/{path.name}",
                "file": person["file"],
                **{k: meta[k] for k in ("source", "author", "license", "licenseUrl")},
            },
        }
    path = ROOT / "data" / "wikidata_candidates.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Candidates: {len(result)} portraits in {out_dir.relative_to(ROOT)}/, credits in {path.relative_to(ROOT)}")
    if missing:
        print("No portrait found for:", ", ".join(missing))


# --- Members of parliament: portraits -----------------------------------------------

NATIONAL_COUNCIL = "Q18510612"  # Wikidata: member of the Swiss National Council
COUNCIL_OF_STATES = "Q18510613"  # Wikidata: member of the Swiss Council of States


def fetch_parliament_portraits() -> None:
    """
    Portraits of the current members of parliament. Everyone who has held
    a seat in either chamber is asked from Wikidata; a member is the person
    with the same birth date whose name contains the member's last name.
    Saved as site/img/parliament/<name>.jpg, credits in
    data/wikidata_parliament.json (keyed by "First Last|YYYY-MM-DD").
    """
    from build_data import parliament_key, parliament_rows  # same folder

    rows = parliament_rows()
    if not rows:
        return
    query = f"""
        SELECT ?person ?personLabel (MIN(?born) AS ?birth) (MIN(?img) AS ?image) WHERE {{
          VALUES ?position {{ wd:{NATIONAL_COUNCIL} wd:{COUNCIL_OF_STATES} }}
          ?person p:P39/ps:P39 ?position ; wdt:P569 ?born .
          FILTER(YEAR(?born) > 1930)
          OPTIONAL {{ ?person wdt:P18 ?img }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "de,fr,it,en". }}
        }}
        GROUP BY ?person ?personLabel
    """
    data = json.loads(get(WIKIDATA_SPARQL, {"query": query, "format": "json"}))
    by_birth: dict[str, list[dict]] = {}
    for row in data["results"]["bindings"]:
        by_birth.setdefault(row["birth"]["value"][:10], []).append(row)

    chosen, missing = {}, []
    for row in rows:
        key = parliament_key(row)
        # "Binder-Keller" -> "binder", "de Quattro" -> "quattro"
        last = normalise(re.split(r"[- ]", row["LastName"])[-1 if " " in row["LastName"] else 0])
        people = [p for p in by_birth.get(key.split("|")[1], []) if last in normalise(p["personLabel"]["value"])]
        person = next((p for p in people if "image" in p), None)
        if person:
            chosen[key] = {
                "wikidata": person["person"]["value"].rsplit("/", 1)[1],
                "file": urllib.parse.unquote(person["image"]["value"].rsplit("/", 1)[1]),
            }
        else:
            missing.append(key.split("|")[0])

    info = commons_info(sorted({c["file"] for c in chosen.values()}))
    out_dir = IMG_DIR / "parliament"
    out_dir.mkdir(parents=True, exist_ok=True)
    result = {}
    for key, c in sorted(chosen.items()):
        meta = info.get(c["file"])
        if not meta:
            missing.append(key.split("|")[0])
            continue
        ext = Path(urllib.parse.urlparse(meta["thumb"]).path).suffix.lower() or ".jpg"
        path = out_dir / f"{slug(key.split('|')[0])}{ext}"
        if not path.exists():  # rerunning only downloads what is new
            path.write_bytes(get(meta["thumb"]))
            time.sleep(0.5)
        result[key] = {
            "wikidata": c["wikidata"],
            "portrait": {
                "image": f"img/parliament/{path.name}",
                "file": c["file"],
                **{k: meta[k] for k in ("source", "author", "license", "licenseUrl")},
            },
        }
    out = ROOT / "data" / "wikidata_parliament.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Parliament: {len(result)} of {len(rows)} portraits in {out_dir.relative_to(ROOT)}/, credits in {out.relative_to(ROOT)}")
    if missing:
        print("No portrait found for:", ", ".join(sorted(missing)))


# --- main ------------------------------------------------------------------------------

def main() -> None:
    councillors = load_councillors()
    members = wikidata_members()
    print(f"Wikidata: {len(members)} people held the position")

    by_name = {normalise(m["label"]): m for m in members}
    by_id = {m["wikidata"]: m for m in members}

    matched, unmatched = {}, []
    for c in councillors:
        m = by_id.get(MANUAL_MATCHES.get(c["number"], "")) or by_name.get(normalise(c["name"]))
        if m:
            matched[c["number"]] = m
        else:
            unmatched.append(c)

    info = commons_info(sorted({m["file"] for m in matched.values() if m["file"]}))

    IMG_DIR.mkdir(parents=True, exist_ok=True)
    result, no_portrait = {}, []
    for number, m in sorted(matched.items()):
        entry = {
            "wikidata": m["wikidata"],
            "birthDate": m["birthDate"],
            "nativeLanguages": m["nativeLanguages"],
            "spokenLanguages": m["spokenLanguages"],
            "portrait": None,
        }
        meta = info.get(m["file"]) if m["file"] else None
        if meta:
            ext = Path(urllib.parse.urlparse(meta["thumb"]).path).suffix.lower() or ".jpg"
            path = IMG_DIR / f"{number}{ext}"
            if not path.exists():  # rerunning only downloads what is new
                path.write_bytes(get(meta["thumb"]))
                time.sleep(0.5)
            entry["portrait"] = {
                "image": f"img/{path.name}",  # relative to site/
                "file": m["file"],
                "source": meta["source"],
                "author": meta["author"],
                "license": meta["license"],
                "licenseUrl": meta["licenseUrl"],
            }
        else:
            no_portrait.append(number)
        result[str(number)] = entry

    OUT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Matched {len(result)} councillors; {len(result) - len(no_portrait)} portraits in {IMG_DIR.relative_to(ROOT)}/")
    print(f"Wrote {OUT_PATH.relative_to(ROOT)}")
    if unmatched:
        print("Not found on Wikidata (add to MANUAL_MATCHES):")
        for c in unmatched:
            print(f"  {c['number']}: {c['name']}")
    if no_portrait:
        print("No portrait on Wikidata for numbers:", ", ".join(map(str, no_portrait)))
    fetch_candidate_portraits()
    fetch_parliament_portraits()
    print("Now run: python3 scripts/build_data.py")


if __name__ == "__main__":
    main()
