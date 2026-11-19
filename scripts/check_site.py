#!/usr/bin/env python3
"""
Check the web app before it is deployed (run by the pipeline on every push,
and handy locally before a commit):

    python3 scripts/check_site.py

1. site/data/data.json is up to date with the files it is built from:
   the councillors and the people list match data/all_federal_councillors.csv,
   data/wikidata.json and data/candidates.csv. (The BFS figures are not
   re-downloaded; they only change when you run build_data.py.)
2. Every file the page refers to exists: scripts, styles, fonts, the
   portrait of every councillor and candidate, the flag of every canton
   shown, and every text (data-content="intro" ->
   site/content/<language>/intro.md, in every language folder).
3. Every JavaScript file is free of syntax errors (needs Node.js).

Exits with an error message if anything is wrong. Only the Python standard
library is used.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_data  # noqa: E402  (offline parts only: no BFS download)

ROOT = build_data.ROOT
SITE = ROOT / "site"

problems: list[str] = []


def check_data() -> None:
    """data.json matches what build_data.py would write from the CSV files."""
    data = json.loads(build_data.OUT_PATH.read_text(encoding="utf-8"))
    councillors = build_data.load_councillors()
    build_data.add_wikidata(councillors)
    if data["councillors"] != councillors:
        problems.append("site/data/data.json: councillors are out of date. Run scripts/build_data.py.")
    if data["candidates"] != build_data.load_candidates():
        problems.append("site/data/data.json: people list is out of date. Run scripts/build_data.py.")
    if data.get("flags") != build_data.load_flags():
        problems.append("site/data/data.json: canton flags are out of date. Run scripts/build_data.py.")
    for c in data["councillors"] + data["candidates"]:
        image = c.get("portrait", {}).get("image")
        if image and not (SITE / image).is_file():
            problems.append(f"Portrait of {c['name']} missing: site/{image}")
    # Every card shows its canton's flag (img/flags/<code>.svg, scripts/fetch_flags.py)
    for code in sorted({c["cantonCode"] for c in data["councillors"] + data["candidates"]}):
        if not (SITE / "img" / "flags" / f"{code}.svg").is_file():
            problems.append(f"Flag of canton {code} missing: site/img/flags/{code}.svg (run scripts/fetch_flags.py)")


def check_references() -> None:
    """Local files named in the HTML pages, the CSS and the JS imports exist."""
    refs: list[tuple[Path, str]] = []
    for html in SITE.glob("*.html"):
        refs += [(html, r) for r in re.findall(r'(?:src|href)="([^"#:]+)"', html.read_text(encoding="utf-8"))]
    for css in SITE.glob("css/*.css"):
        refs += [(css, r) for r in re.findall(r'url\(["\']?([^"\')]+)', css.read_text(encoding="utf-8"))
                 if not r.startswith("data:")]
    for js in SITE.glob("js/*.js"):
        refs += [(js, r) for r in re.findall(r'from\s+"(\.[^"]+)"', js.read_text(encoding="utf-8"))]
    # Texts in Markdown: one file per name and language
    languages = [d.name for d in (SITE / "content").iterdir() if d.is_dir()] if (SITE / "content").is_dir() else []
    for html in SITE.glob("*.html"):
        for name in re.findall(r'data-content="([^"]+)"', html.read_text(encoding="utf-8")):
            for language in languages or ["de"]:
                refs.append((html, f"content/{language}/{name}.md"))
    for source, ref in refs:
        target = (source.parent / ref).resolve()
        if target.is_dir():
            target /= "index.html"  # a link to "./" opens the folder's index.html
        if not target.is_file():
            problems.append(f"{source.relative_to(ROOT)}: '{ref}' not found")


def check_javascript() -> None:
    """Every JS module parses (node --check, read as an ES module)."""
    node = shutil.which("node")
    if not node:
        print("Node.js not found: JavaScript syntax not checked")
        return
    for js in sorted(SITE.glob("js/*.js")):
        result = subprocess.run([node, "--input-type=module", "--check"], stdin=js.open("rb"),
                                capture_output=True, text=True)
        if result.returncode:
            problems.append(f"{js.relative_to(ROOT)}: syntax error\n{result.stderr.strip()}")


def main() -> None:
    check_data()
    check_references()
    check_javascript()
    if problems:
        sys.exit("Check failed:\n- " + "\n- ".join(problems))
    print("All checks passed.")


if __name__ == "__main__":
    main()
