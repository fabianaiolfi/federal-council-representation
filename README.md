# Descriptive Representation of the Swiss Federal Council

A small web app that shows how closely the Swiss Federal Council (Bundesrat)
mirrors the Swiss population. It compares four dimensions: **gender, party, language and age**.
The interface is in Swiss High German.

The page has three parts:

1. **Der Bundesrat:** one panel with the seven members (portrait, name,
   party, canton; by seniority) and a
   timeline. The ← → buttons, the slider or the ← → keys step through every
   version of the Council since 1848 (94 so far). The panel head stays at the
   top of the screen while you scroll through the whole page.
2. **Der Bundesrat im Vergleich mit der Schweizer Bevölkerung:** how closely
   the Council matches the population by **gender, party, language and
   age**. The overall score at the top is the average of the four; below it,
   each comparison has its own score and two bars (Council vs population).
   Everything updates with every step in the panel above.
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

This reads `data/all_federal_councillors.csv` and `data/wikidata.json`,
fetches the population data from the Federal Statistical Office (BFS; see
"Comparisons and data" below) and writes `site/data/data.json`.
It only uses the Python standard library.

Run it again whenever

- the CSV changes (new councillor, someone leaves), or
- BFS publishes a new year (usually in late summer).

## Birth dates, languages and portraits (Wikidata)

```bash
python3 scripts/fetch_wikidata.py   # then: python3 scripts/build_data.py
```

The CSV has no birth dates, languages or pictures. The script asks Wikidata
for everyone who held the position "member of the Swiss Federal Council"
(Q11811941), with their birth date (P569), native language (P103), languages
spoken (P1412) and portrait (P18), and matches them to the CSV by name. It
downloads a 250 px wide version of each portrait from Wikimedia Commons into
`site/img/<number>.<ext>` and writes everything else, including author and
licence of each image, to `data/wikidata.json`. The page lists the image
credits under "Bildnachweise" in the footer (several licences, e.g. CC BY-SA,
require this).

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
  version until that day.
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
- It works for any number of groups, so all four comparisons use it.

The **overall score** is the plain average of the comparisons that have data
for the version shown.

Because the Council has only 7 seats, 100 % is usually impossible. For gender,
with 2025 figures (50.3 % women), the best achievable score is 93.1 %
(4 women, 3 men).

## Comparisons and data

The population side always comes from the Federal Statistical Office (BFS),
for the time of the version shown. Past versions are measured on the day
they took office; the Council in office is measured **as of today** (today's
ages, latest population figures). The rule for which year is used: the latest
year with data **up to** that day; before the first year with data, the
first year (the bar label always shows the year used).

| Comparison | Council side | Population side (BFS) | Data since |
|---|---|---|---|
| Gender | `gender` in the CSV | Permanent resident population by sex, STAT-TAB `px-x-0102030000_101` | 1860, yearly |
| Party | `party` in the CSV, mapped to the BFS party names | Party strength (share of the vote) in the National Council election, table T 17.02.02.03.01 | 1919, every election |
| Language | Main language (Wikidata, see below) | Main languages of the permanent resident population, table T 01.08.01.01 | 1910; censuses until 2000, yearly since 2010 |
| Age | Age on the day the version took office; today's age for the Council in office (birth dates from Wikidata) | Permanent resident population aged 18+, same table as gender | 1860, yearly |

Details and choices:

- **Party:** before the first proportional election (1919) there is no
  party-strength data, so the party comparison is left out for earlier
  versions (and from their overall score). An election (held in October)
  counts for versions that took office from 1 November of that year. Historic
  party names are mapped to today's party lines (`PARTY_TO_BFS` in
  `build_data.py`), e.g. freis. → FDP, kath.-kons./KCVP/CVP → Mitte, BGB →
  SVP. Samuel Schmid and Eveline Widmer-Schlumpf count as SVP until BDP
  Schweiz was founded (1 Nov 2008), then as BDP. The bars show FDP, Mitte, SP,
  SVP, any other party with a seat, and "Übrige" (all other parties; they
  have no seat, so grouping them doesn't change the score).
- **Language:** a councillor's main language is their native language on
  Wikidata; else the only national language they are listed as speaking;
  else the majority language of their canton. Hand-checked corrections are in
  `LANGUAGE_CORRECTIONS` in `build_data.py` (so far: Pascal Couchepin, French).
  The population includes "other languages"; since 2010 people can name
  several main languages, so the shares are rescaled to 100 %.
- **Hover details:** hovering "Übrige Parteien" lists the parties it
  contains (from the same election table). Hovering "Andere Sprachen" lists
  the languages it contains, from BFS table T 01.08.01.02 "Hauptsprachen
  nach Grossregion und Kanton" (since 2010; people aged 15+), scaled to the
  share shown.
- **Age:** groups 18–39, 40–64 and 65+ (`AGE_GROUPS` in `build_data.py`);
  the population is compared from age 18, the voting age and the minimum
  age for the Federal Council since 1991.
- **Colours:** all comparisons use one categorical palette (custom
  properties at the top of `style.css`). Parties are shown left to right in
  their usual colours where possible: SP red, Mitte amber, FDP blue, SVP
  green, other parties with a seat (BDP) violet, "Übrige Parteien" light grey.
  Languages: German blue, French orange, Italian aqua, Romansh amber, other
  languages light grey. Age is ordered, so it uses one hue (light to dark
  blue). For every bar, the order of its colours was checked for colour-blind
  separation.
- **Hover on the Council bars:** lists the members in that part of the bar,
  with their age on the day the version is measured, e.g. "Parmelin (66)".

## Project structure

```
data/
  all_federal_councillors.csv   source data: every councillor since 1848
  wikidata.json                 written by fetch_wikidata.py
scripts/
  build_data.py                 builds site/data/data.json (CSV + BFS API)
  fetch_wikidata.py             birth dates, languages, portraits (Wikidata)
  serve.py                      local web server without browser caching
site/                           the web app (static files; deploy this folder)
  index.html                    page structure
  css/style.css                 all styling (design tokens at the top)
  js/app.js                     loads data, builds the page, browsing
  js/council.js                 versions of the Council
  js/comparisons.js             the four comparisons (categories, BFS data)
  js/metrics.js                 the score calculation (no DOM code)
  js/i18n.js                    all visible text + number/date formatting
  data/data.json                generated by build_data.py
  img/                          portraits (written by fetch_wikidata.py)
```

No framework is used. `app.js` follows a simple pattern: the page is built
once (`setup…()` functions). A small `state` object holds which version
is shown. A single `update()` function redraws the
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

- Population by sex and age: Federal Statistical Office (BFS), STAT-TAB table
  [px-x-0102030000_101](https://www.pxweb.bfs.admin.ch/pxweb/de/px-x-0102030000_101/-/px-x-0102030000_101.px/)
- Main languages: BFS, table T 01.08.01.01 "Hauptsprachen seit 1910"; for
  the breakdown of other languages, table T 01.08.01.02 "Hauptsprachen nach
  Grossregion und Kanton"
- Party strength: BFS, table T 17.02.02.03.01 "Nationalratswahlen: Stärke
  der Parteien"
- Federal Council: `data/all_federal_councillors.csv`
- Birth dates, languages and portraits of the councillors:
  [Wikidata](https://www.wikidata.org/) and
  [Wikimedia Commons](https://commons.wikimedia.org/)

## Image licences

The portraits in `site/img/` are **not** covered by this project's own
licence. Each image keeps the licence it was published under on Wikimedia
Commons (public domain, Creative Commons, or free use with attribution).
Author, licence and source of every image are listed in
`data/wikidata.json` and on the page under "Bildnachweise". Keep these
credits when reusing or redistributing the images.
