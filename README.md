# Descriptive Representation of the Swiss Federal Council

A small web app that shows how closely the Swiss Federal Council (Bundesrat)
mirrors the Swiss population. It currently compares one dimension, **gender**.
The interface is in Swiss High German.

The page has three parts:

1. **Der Bundesrat:** the seven members of the Council. A navigator bar
   (← → buttons and a slider) lets you browse every composition since 1848.
   The bar stays at the top of the screen while you scroll.
2. **Der Vergleich:** the gender match as one number, plus bars comparing
   the Council with the population **of the year it took office** (BFS data
   since 1860). For the Council in office today, you can pick whether a woman
   or a man succeeds a departing member and watch the number and bars update.
3. **Quellen:** data sources.

## Run the app locally

The app is a set of static files (HTML, CSS, JavaScript and one JSON data
file). It has no dependencies to install and no build step. All you need is a
small web server, and Python 3 includes one (Python 3 comes preinstalled on
macOS).

1. Open a terminal and go to the project folder:

   ```bash
   cd path/to/federal-council-representation
   ```

2. Start a local web server for the `site` folder:

   ```bash
   python3 -m http.server 8000 -d site
   ```

   You should see `Serving HTTP on :: port 8000 …`.

3. Open <http://localhost:8000> in your browser.

4. When you're done, stop the server with `Ctrl + C` in the terminal.

Notes:

- Opening `site/index.html` by double-clicking **does not work**. The page loads
  its data with `fetch()`, which browsers block for `file://` pages. The page
  then shows an error message.
- If port 8000 is already in use, pick another one, e.g.
  `python3 -m http.server 8080 -d site` → <http://localhost:8080>.
- In VS Code you can also use the *Live Server* extension: right-click
  `site/index.html` → *Open with Live Server*.
- After editing files, reload the page. If you still see the old version, do
  a hard reload (`Cmd + Shift + R`).

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

## How the compositions are derived

`site/js/council.js` turns the CSV into the successive compositions of the
Council:

- The membership can only change on an election day or on the day after
  someone left, so only those days are checked.
- The CSV has the day someone was *elected*, not the day they took office.
  Successors are usually elected weeks before their predecessor leaves.
  Rule: a newly elected member takes a seat once one is free (if more than
  7 people qualify on a day, the 7 most senior are in office).
- Short gaps with an empty seat (between a departure and the successor
  taking office) are skipped. Only full 7-member compositions are shown.
- Each composition is compared with the population of the **year it took
  office**. For years without BFS data, the nearest year is used (1860 for
  the Councils of 1848–1859, the latest year for the most recent ones). The
  bar label always shows the year actually used.

The app works out which composition is **current** from the visitor's date:

- A member with a `left_office_date` **in the future** stays in the current
  composition with a "Rücktritt per …" badge, and the successor picker
  appears for them.
- Once that date has passed, the member drops out. If no complete
  composition is in office (because the successor hasn't been added to the
  CSV yet), the page shows a notice. Add the successor and rerun the script.

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
scripts/
  build_data.py                 builds site/data/data.json (CSV + BFS API)
site/                           the web app (static files; deploy this folder)
  index.html                    page structure
  css/style.css                 all styling (design tokens at the top)
  js/app.js                     loads data, builds the page, browsing + scenario
  js/council.js                 compositions over time, population year lookup
  js/metrics.js                 the score calculation (no DOM code)
  js/i18n.js                    all visible text + number/date formatting
  data/data.json                generated by build_data.py
```

No framework is used. `app.js` follows a simple pattern: the page is built
once (`setup…()` functions). A small `state` object holds which composition
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
