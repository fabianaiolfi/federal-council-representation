#!/usr/bin/env python3
"""
Download the 26 canton flags from Wikimedia Commons (the files used in the
German Wikipedia "Liste der Wappen und Fahnen der Schweizer Kantone").

    python3 scripts/fetch_flags.py

Saves site/img/flags/<canton code>.svg (e.g. ZH.svg) and the author and
licence of each file in data/flags.json (shown on the Quellen page via
build_data.py). The cards show the flag instead of the canton code.

Only the Python standard library is used.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from fetch_wikidata import COMMONS_API, get, plain_text  # same folder

ROOT = Path(__file__).resolve().parent.parent
FLAG_DIR = ROOT / "site" / "img" / "flags"
OUT_PATH = ROOT / "data" / "flags.json"

# Canton code -> file on Wikimedia Commons
FILES = {
    "ZH": "Flag of Canton of Zürich.svg",
    "BE": "Flag of Canton of Bern.svg",
    "LU": "CHE Luzern Flag.svg",
    "UR": "Flag of Canton of Uri.svg",
    "SZ": "Flag of Canton of Schwyz.svg",
    "OW": "Flag of Canton of Obwalden.svg",
    "NW": "Flag of Canton of Nidwalden.svg",
    "GL": "Flag of Canton of Glarus.svg",
    "ZG": "Flag of Canton of Zug.svg",
    "FR": "Flag of Canton of Fribourg.svg",
    "SO": "Flag of Canton of Solothurn.svg",
    "BS": "Flag of Canton of Basel.svg",
    "BL": "CHE Basel-Landschaft Flag.svg",
    "SH": "Flag of Canton of Schaffhausen.svg",
    "AR": "Flag of Canton of Appenzell Ausserrhoden.svg",
    "AI": "Flag of Canton of Appenzell Innerrhoden.svg",
    "SG": "Flag of Canton of Sankt Gallen 2011.svg",
    "GR": "Flag of Canton of Graubünden.svg",
    "AG": "Flag of Canton of Aargau.svg",
    "TG": "Flag of Canton of Thurgau.svg",
    "TI": "Flag of Canton of Tessin.svg",
    "VD": "CHE Vaud Flag.svg",
    "VS": "CHE Valais Flag.svg",
    "NE": "Flag of Canton of Neuchâtel.svg",
    "GE": "CHE Canton de Genève Flag.svg",
    "JU": "Flag of Canton of Jura.svg",
}


def main() -> None:
    data = json.loads(get(COMMONS_API, {
        "action": "query",
        "format": "json",
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "titles": "|".join(f"File:{f}" for f in FILES.values()),
    }))
    renamed = {n["to"]: n["from"] for n in data["query"].get("normalized", [])}
    info = {}
    for page in data["query"]["pages"].values():
        title = renamed.get(page["title"], page["title"]).removeprefix("File:")
        ii = page["imageinfo"][0]
        meta = ii.get("extmetadata", {})
        info[title] = {
            "url": ii["url"],
            "source": ii["descriptionurl"],
            "author": plain_text(meta.get("Artist", {}).get("value", "")) or None,  # tidied by build_data.py
            "license": plain_text(meta.get("LicenseShortName", {}).get("value", "")) or None,
            "licenseUrl": meta.get("LicenseUrl", {}).get("value"),
        }

    FLAG_DIR.mkdir(parents=True, exist_ok=True)
    result = {}
    for code, file in FILES.items():
        meta = info[file]
        path = FLAG_DIR / f"{code}.svg"
        if not path.exists():  # rerunning only downloads what is missing
            path.write_bytes(get(meta["url"]))
            time.sleep(0.5)
        result[code] = {"image": f"img/flags/{path.name}", "file": file,
                        **{k: meta[k] for k in ("source", "author", "license", "licenseUrl")}}

    OUT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(result)} flags in {FLAG_DIR.relative_to(ROOT)}/, credits in {OUT_PATH.relative_to(ROOT)}")
    print("Now run: python3 scripts/build_data.py")


if __name__ == "__main__":
    main()
