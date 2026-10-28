# Descriptive Representation of the Swiss Federal Council

A small web app that shows how closely the Swiss Federal Council (Bundesrat)
mirrors the Swiss population. It currently compares one dimension, **gender**.
The interface is in Swiss High German.

The page has three parts:

1. **Der Bundesrat:** one panel with the seven members (portrait, name,
   party, canton; by seniority) and a
   timeline. The ← → buttons, the slider or the ← → keys step through every
   version of the Council since 1848 (94 so far). The panel head stays at the
   top of the screen while you scroll through the members.
2. **Der Vergleich:** the gender match as one number, plus bars comparing
   the Council with the population **of the year it took office** (BFS data
   since 1860). For the Council in office today, you can pick whether a woman
   or a man succeeds a departing member and watch the number and bars update.
3. **Quellen:** data sources and picture credits for the portraits.

## Run the app locally

The app is a set of static files (HTML, CSS, JavaScript and one JSON data
file). It has no dependencies to install and no build step. All you need is a
small web server, and Python 3 includes one (Python 3 comes preinstalled on
macOS).

1. Open a terminal and go to the project folder:

   ```bash
   cd path/to/federal-council-representation
   ```

2. Start the local web server:

   ```bash
   python3 scripts/serve.py
   ```

   You should see `Serving …/site at http://localhost:8000`.

3. Open <http://localhost:8000> in your browser.

4. When you're done, stop the server with `Ctrl + C` in the terminal.

Notes:

- `scripts/serve.py` is Python's built-in web server
  (`python3 -m http.server 8000 -d site`) plus one header that stops the
  browser from reusing old copies of files. With the plain built-in server,
  the browser can mix freshly edited files with old cached ones after a code
  change. The page then shows "Beim Anzeigen ist ein Fehler aufgetreten";
  a hard reload (`Cmd + Shift + R`) fixes it.
- Opening `site/index.html` by double-clicking **does not work**. The page loads
  its data with `fetch()`, which browsers block for `file://` pages. The page
  then shows "Die Daten konnten nicht geladen werden".
- If port 8000 is already in use, pick another one, e.g.
  `python3 scripts/serve.py 8080` → <http://localhost:8080>.

## Update the data

```bash
python3 scripts/build_data.py
```

This reads `data/all_federal_councillors.csv`, fetches the population by sex
for every year from the Federal Statistical Office (BFS), and writes
`site/data/data.json`.
It only uses the Python standard library.

Run it again whenever

- the CSV changes (new councillor, someone leaves), or
- BFS publishes a new year (usually in late summer).

## Portraits

```bash
python3 scripts/fetch_portraits.py   # then: python3 scripts/build_data.py
```

The script asks Wikidata for everyone who held the position "member of the
Swiss Federal Council" (Q11811941) and their portrait (property P18), matches
them to the CSV by name, and downloads a 250 px wide version of each image
from Wikimedia Commons into `site/img/<number>.<ext>`. Author and licence of
each image go to `data/portraits.json`; `build_data.py` adds them to
`site/data/data.json`, and the page lists them under "Bildnachweise" in the
footer (several licences, e.g. CC BY-SA, require this credit).

- Rerunning the script only downloads images that are missing. To replace
  one, delete its file in `site/img/` first.
- If a new councillor's name is spelled differently on Wikidata, the script
  says so; add them to `MANUAL_MATCHES` in the script.
- The images are stored in this repository rather than loaded from
  Wikimedia, so the page is fast and visitors' browsers don't contact a third
  party.

## How the versions are derived

`site/js/council.js` turns the CSV into every version of the Council:

- A new version starts whenever someone leaves or joins. The membership can
  only change on an election day or on the day after someone left, so only
  those days are checked.
- The CSV has the day someone was *elected*, not the day they took office.
  Successors are usually elected weeks before their predecessor leaves.
  Rule: a newly elected member takes a seat once one is free (if more than
  7 people qualify on a day, the 7 most senior are in office).
- Short gaps with an empty seat (between a departure and the successor
  taking office) are skipped. Only full 7-member versions are shown.
- Members are listed by seniority (earliest election first).
- Each version is compared with the population of the **year it took
  office**. For years without BFS data, the nearest year is used (1860 for
  1848–1859, the latest year for the most recent versions). The bar label
  always shows the year actually used.

The app works out which version is **current** from the visitor's date:

- A member with a `left_office_date` **in the future** stays in the current
  version with a "Rücktritt per …" badge, and the successor picker appears
  for them.
- Once that date has passed, the member drops out. If today has an empty
  seat (e.g. the successor hasn't been added to the CSV yet), the page shows
  the latest complete version and a notice. Add the successor and rerun the
  script.

## The measure

**Overlap coefficient:** `score = Σ min(pᵢ, qᵢ)`

- `p`: the Council's share for each group, `q`: the population's share
- 100 % means the two compositions are identical, 0 % means they share nothing
- It equals `1 − ½·Σ|pᵢ − qᵢ|`, i.e. 1 minus the total variation distance.
  In political science this distance is the Loosemore–Hanby index of
  disproportionality.
- It works for any number of groups, so the same function can later be used
  for language region, canton, party or age.

Because the Council has only 7 seats, 100 % is impossible against a
population that is roughly half women. With 2025 figures (50.3 % women), the
best achievable score is 93.1 %, with 4 women and 3 men.

## Project structure

```
data/
  all_federal_councillors.csv   source data: every councillor since 1848
  portraits.json                portrait credits (written by fetch_portraits.py)
scripts/
  build_data.py                 builds site/data/data.json (CSV + BFS API)
  fetch_portraits.py            downloads portraits from Wikimedia Commons
  serve.py                      local web server without browser caching
site/                           the web app (static files; deploy this folder)
  index.html                    page structure
  css/style.css                 all styling (design tokens at the top)
  js/app.js                     loads data, builds the page, browsing + scenario
  js/council.js                 versions of the Council, population year lookup
  js/metrics.js                 the score calculation (no DOM code)
  js/i18n.js                    all visible text + number/date formatting
  data/data.json                generated by build_data.py
  img/                          portraits (written by fetch_portraits.py)
```

No framework is used. `app.js` follows a simple pattern: the page is built
once (`setup…()` functions). A small `state` object holds which version
is shown and the scenario choice. A single `update()` function redraws the
cards, score and bars whenever `state` changes.

## Next iterations

- **Deploy:** `site/` is a static website. It can be hosted as-is on
  GitHub Pages, Netlify or Cloudflare Pages.
- **Google Analytics:** paste the `gtag.js` snippet where marked in the
  `<head>` of `site/index.html`. Under Swiss data protection law (revDSG) and
  the GDPR you will likely need a privacy notice and possibly a consent
  banner.
- **Language switcher:** add a `"fr-CH"` (etc.) block to `site/js/i18n.js` and
  a button that calls `setLanguage()` and re-renders.
- **Explanations:** a short section on how the measure is calculated.

## Sources

- Population: Federal Statistical Office (BFS), STAT-TAB table
  [px-x-0102030000_101](https://www.pxweb.bfs.admin.ch/pxweb/de/px-x-0102030000_101/-/px-x-0102030000_101.px/),
  permanent resident population by sex and age
- Federal Council: `data/all_federal_councillors.csv`
- Portraits: [Wikimedia Commons](https://commons.wikimedia.org/), via
  [Wikidata](https://www.wikidata.org/)

## Image licences

The portraits in `site/img/` are **not** covered by this project's own
licence. Each image keeps the licence it was published under on Wikimedia
Commons (public domain, Creative Commons, or free use with attribution).
Author, licence and source of every image are listed in
`data/portraits.json` and on the page under "Bildnachweise". Keep these
credits when reusing or redistributing the images.
