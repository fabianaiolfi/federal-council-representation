# Descriptive Representation of the Swiss Federal Council

A small web app that shows how closely the Swiss Federal Council (Bundesrat)
mirrors the Swiss population. It compares four dimensions: **gender, party, language and age**.
The interface is in Swiss High German.

The page has three parts:

1. **Der Bundesrat:** one panel with the seven members (portrait, name,
   "party · language"; by seniority) and a
   timeline. The ← → buttons, the slider or the ← → keys step through every
   version of the Council since 1848 (94 so far). The panel head stays at the
   top of the screen while you scroll through the whole page.

   **"Was wäre, wenn …?"** Every member has an "Ersetzen" button. It opens
   an editor ("Wer ersetzt …?") with three ways to choose the new person:

   - **Selbst zusammenstellen:** set gender, party (the parties with at
     least 1 % in that period's National Council election), language and
     age yourself. Starts with the replaced member's profile.
   - **Aus Liste wählen:** pick a person from `data/candidates.csv` (see
     "People for the list" below). Their age is calculated for the version
     shown; only people who would have been 18 or older are offered.
   - **Bestmögliche Person:** the app tries every combination of gender,
     party, language and age group for this seat (with the other members as
     they are) and shows a profile with the highest overall score. If
     several profiles are equally good, clicking again shows the next one
     ("Variante 2 von 3"). Ages are the middle of the age group.

   The modes share one profile: after picking a person or a best profile,
   "Selbst zusammenstellen" shows it and lets you adjust it. Every change
   updates the editor's live result (overall score and the four
   comparisons, with the difference to the real Council) and all bars on the
   page. You can replace several members; changes stay with the version
   they were made in and can be undone one by one or all at once. Nothing is
   saved: reloading the page shows the real Councils.
2. **Der Bundesrat im Vergleich mit der Schweizer Bevölkerung:** how closely
   the Council matches the population by **gender, party, language and
   age**. The overall score at the top is the average of the four; below it,
   each comparison has its own score and two bars (Council vs population).
   Everything updates with every step in the panel above. "Was bedeutet
   das?" next to the overall score explains the measure, with a worked
   example for the Council shown.

   A switch below the title changes between **"Ausgewählter Bundesrat"**
   (the view above) and **"Verlauf seit 1848"**: a step line chart of the
   overall score and the four comparisons for every version of the Council
   (x: time, y: 0–100 %). Each step is one version; the selected one is
   shaded, with a dot on each line. Hovering shows all values of a version,
   clicking selects it (the whole page follows). "Werte als Tabelle" lists
   the same values. The chart shows the real Councils, without
   replacements made in the editor. The party line starts in 1919.
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

## People for the list ("Aus Liste wählen")

Add people to `data/candidates.csv` and run `python3 scripts/build_data.py`.
One row per person:

```csv
name,gender,party,language,birth_date,canton
Vorname Nachname,female,GRÜNE,fr,1980-05-17,Genf
```

| Column | Values |
|---|---|
| `name` | Full name, shown on the card and in the tooltips |
| `gender` | `female` or `male` |
| `party` | As in the BFS election statistics: `SP`, `Mitte`, `FDP`, `SVP`, `GRÜNE`, `GLP`, `EVP`, `EDU`, … (historic names like `CVP` or `BGB` are converted) |
| `language` | `de`, `fr`, `it`, `rm` or `other` (or `Deutsch`, `Französisch`, …) |
| `birth_date` | `YYYY-MM-DD`, or just `YYYY` if only the year is known (then 1 July is assumed) |
| `canton` | Optional; kept for later (e.g. a comparison by region), not shown at the moment |

The script stops with a message pointing to the line if a value is missing
or unknown. While the file has no rows, the page says "Noch keine Personen
hinterlegt."

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

Each comparison ("Übereinstimmung") is the **overlap** between two
distributions:

```
score = Σ min(pᵢ, qᵢ)
```

- `pᵢ`: the Council's share in group `i` (e.g. women), `qᵢ`: the population's
  share in the same group. Both add up to 100 %.
- For every group, take the smaller of the two shares, then add them up.
- 100 % means the two compositions are identical, 0 % means they share
  nothing.

**Example (gender, today):** Council 28.6 % women and 71.4 % men, population
50.3 % women and 49.7 % men → 28.6 % + 49.7 % = **78.3 %**.

### Relation to established indices

Since `min(a, b) = (a + b − |a − b|) / 2` and both distributions add up to
100 %:

```
Σ min(pᵢ, qᵢ) = 1 − ½ Σ |pᵢ − qᵢ|
```

The right-hand part, `½ Σ |pᵢ − qᵢ|`, is a well-known *deviation* measure
under several names:

- **Loosemore–Hanby index** (LH) of disproportionality, when comparing parties'
  vote shares with their seat shares;
- **index of dissimilarity** (Duncan) in segregation research;
- **total variation distance** in statistics.

So the score is `1 − LH`, which political science calls the **Rose index** or
**Party Total Representativity** (see
[Loosemore–Hanby index](https://en.wikipedia.org/wiki/Loosemore%E2%80%93Hanby_index)).
For gender, language and age, where there are no parties, it is
`1 − index of dissimilarity`; the formula is the same.

The score and the deviation carry exactly the same information (78.3 %
match = 21.7 % deviation). The app shows the match rather than the deviation
because the page asks a positive question ("Wie gut bildet der Bundesrat die
Bevölkerung ab?"): 100 % = perfect match reads more naturally than a
deviation where lower is better.

### Properties worth knowing

- **Grouping groups without members changes nothing.** Merging groups in
  which the Council has no members does not change the score. That is why
  the many small parties without a seat can be shown as "Übrige Parteien".
- **Many small groups add up.** Small deviations count linearly, so with many
  small categories (e.g. small parties) they add up. The Gallagher index
  (least squares) is an alternative that weights large deviations more
  heavily; the app does not use it.
- **Seven seats.** The Council's shares move in steps of 1/7 ≈ 14.3 %, so
  100 % is usually impossible. For gender, with 2025 figures (50.3 % women),
  the best achievable score is 93.1 % (4 women, 3 men).

The **overall score** is the plain average of the comparisons that have data
for the version shown (each comparison weighs the same).

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
  Schweiz was founded (1 Nov 2008), then as BDP. The bars show SP, Mitte,
  FDP, SVP (left to right), any other party with a seat, and "Übrige
  Parteien" (all other parties; they have no seat, so grouping them doesn't
  change the score).
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
  green; other parties with a seat follow in this order: GRÜNE aqua, GLP
  violet, BDP and any other party magenta; "Übrige Parteien" light grey.
  Languages: German blue, French orange, Italian aqua, Romansh amber, other
  languages light grey. Age is ordered, so it uses one hue (light to dark
  blue). For every bar, the order of its colours was checked for colour-blind
  separation. In the history chart, the overall score is a thick black line;
  gender, party, language and age use blue, orange, aqua and amber.
- **Hover on the Council bars:** lists the members in that part of the bar
  by last name; in the age comparison with their age on the day the version
  is measured, e.g. "Parmelin (66)".

## Project structure

```
data/
  all_federal_councillors.csv   source data: every councillor since 1848
  candidates.csv                people for "Aus Liste wählen" (you fill this in)
  wikidata.json                 written by fetch_wikidata.py
scripts/
  build_data.py                 builds site/data/data.json (CSV + BFS API)
  check_site.py                 checks before deploying (run by the pipeline)
  fetch_wikidata.py             birth dates, languages, portraits (Wikidata)
  serve.py                      local web server without browser caching
site/                           the web app (static files; this folder is published)
  index.html                    page structure
  _headers                      browser caching rules (Cloudflare Pages)
  css/style.css                 all styling (design tokens at the top)
  js/app.js                     loads data, builds the page, browsing
  js/council.js                 versions of the Council
  js/comparisons.js             the four comparisons (categories, BFS data)
  js/chart.js                   step line chart for "Verlauf seit 1848" (SVG)
  js/metrics.js                 the score calculation (no DOM code)
  js/i18n.js                    all visible text + number/date formatting
  js/analytics.js               consent banner + Google Analytics events
  js/config.js                  Google Analytics ID (written by the pipeline)
  datenschutz.html              privacy policy
  data/data.json                generated by build_data.py
  img/                          portraits (written by fetch_wikidata.py)
  fonts/                        Inter (woff2) + its licence
.github/workflows/deploy.yml    pipeline: check, then publish (main / beta)
```

No framework is used. `app.js` follows a simple pattern: the page is built
once (`setup…()` functions). A small `state` object holds which version
is shown. A single `update()` function redraws the
cards, score and bars whenever `state` changes.

## Deployment (beta and public site)

The site is hosted on [Cloudflare Pages](https://pages.cloudflare.com/) and
published by GitHub Actions (`.github/workflows/deploy.yml`):

| Branch | Site |
|---|---|
| `beta` | https://beta.federal-council-representation.pages.dev |
| `main` | https://federal-council-representation.pages.dev |

Work on `beta`, push, and look at the beta site. When it is good, merge
`beta` into `main` (pull request); the public site follows.

On every push the pipeline first runs `scripts/check_site.py`. It checks that
`site/data/data.json` matches the CSV files, that every referenced file
(scripts, fonts, portraits) exists, and that the JavaScript has no syntax
errors. If a check fails, nothing is published. Run it locally before a
commit:

```sh
python3 scripts/check_site.py
```

The folder `site/` is published as it is (no build step). The BFS data is
not downloaded by the pipeline: run `build_data.py` locally and commit
`data.json`, as before. `site/_headers` sets the browser caching: page, code
and data are checked for a newer version on every visit, fonts and portraits
are kept for a while.

Setup (done once): a Cloudflare API token with the permission
"Cloudflare Pages: Edit" and the Cloudflare account ID are stored as the
repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The
first run creates the Pages project `federal-council-representation`.

## Google Analytics

The site uses Google Analytics 4, **only with the visitor's consent**. Until
someone clicks "Akzeptieren" in the banner at the bottom of the screen,
nothing is loaded from Google and no cookie is set. The choice is kept in the
browser (localStorage) and can be changed with "Cookie-Einstellungen" in the
footer. Withdrawing consent deletes the `_ga` cookies. Advertising features
are switched off. All of this lives in `site/js/analytics.js`. The privacy
policy (`site/datenschutz.html`) describes it and must be updated if it
changes.

**Setup (done once).** In Google Analytics, create one property per site
(e.g. "Bundesrat und Bevölkerung" and "… (beta)"), each with a web data
stream. In each property, set Admin → Data collection and modification →
Data retention → Event data retention to 14 months (as stated in the
privacy policy). Then put each Measurement ID (`G-…`) into GitHub:
Settings → Environments → `production` / `beta` → Environment variables →
`GA_MEASUREMENT_ID`. The pipeline writes it into `site/js/config.js` before
publishing. The copy in the repository stays empty, so a local copy shows no
banner and sends nothing. On beta, events also appear in the DebugView
(Admin → DebugView).

**Events.** Besides the automatic page views:

| Event | When | Parameters |
|---|---|---|
| `select_council` | another Council is shown | `method` (button, slider, key, chart), `council_start` |
| `switch_view` | "Ausgewählter Bundesrat" / "Verlauf" | `view` (current, history) |
| `open_info` | "Was bedeutet das?" opened | `method` (click; hover once per visit) |
| `open_table` | history table opened | – |
| `open_credits` | picture credits opened | – |
| `replace_open` / `replace_edit` | "Ersetzen" / "Bearbeiten" on a card | `councillor`, `council_start` |
| `replace_mode` | one of the three modes chosen | `mode` (custom, list, best); for best also the profile |
| `best_next` | next of several best profiles | `variant`, `variants`, profile |
| `replace_field` | gender, party, language or age changed | `field`, `choice` (age: when the slider is let go) |
| `candidate_select` | a person picked from the list | `candidate`, `party` |
| `replace_done` | editor closed ("Fertig" or Escape) | `method`, `councillor`, `council_start`, profile, `score_change` |
| `replace_undo` | "Rückgängig" on a card | `councillor`, `council_start` |
| `replace_reset` | "Alle zurücksetzen" | `council_start`, `count` |

"Profile" means `mode`, `gender`, `party`, `language`, `age`, `age_group`,
and `candidate` for a person from the list. `score_change` is the change in
the overall score of the Council with all replacements, in percentage points,
compared with the real Council. No parameter says anything about the visitor.

To use a parameter in the reports, register it once per property: Admin →
Data display → Custom definitions → Create custom dimension (scope "Event",
same name as the parameter). For `age`, `score_change`, `variant`,
`variants` and `count` create a custom metric instead.

## Next iterations

- **Language switcher:** add a `"fr-CH"` (etc.) block to `site/js/i18n.js` and
  a button that calls `setLanguage()` and re-renders.
- **Explanations:** so far, "Was bedeutet das?" next to the overall score
  explains the measure in short (with a worked example for gender); a longer
  methods section could follow.

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
- Info icon (ⓘ): [Material Icons](https://fonts.google.com/icons) "info_outline"
  by Google, Apache License 2.0. Embedded as inline SVG in `site/index.html`,
  so the page makes no request to Google.
- Font: [Inter](https://fonts.google.com/specimen/Inter) by Rasmus Andersson
  (The Inter Project Authors), SIL Open Font License 1.1 (`site/fonts/OFL.txt`). The files from Google
  Fonts are stored in `site/fonts/` and served with the site, so every device
  shows the same font and visitors' browsers don't contact Google.

## Image licences

The portraits in `site/img/` are **not** covered by this project's own
licence. Each image keeps the licence it was published under on Wikimedia
Commons (public domain, Creative Commons, or free use with attribution).
Author, licence and source of every image are listed in
`data/wikidata.json` and on the page under "Bildnachweise". Keep these
credits when reusing or redistributing the images.
