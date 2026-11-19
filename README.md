# Descriptive Representation of the Swiss Federal Council

A small web app that shows how closely the Swiss Federal Council (Bundesrat)
mirrors the Swiss population. It compares five dimensions: **gender, party, language, age and
Grossregion** (the seven regions of the Federal Statistical Office).
The interface is in Swiss High German.

The main page shows, from top to bottom: the navigator, the overall score,
the seven members, one box per comparison and the history chart.

1. **The Council:** the **navigator** gives the exact dates of the version
   shown ("1. Nov. 2017 – 31. Dez. 2018", standard German month
   abbreviations). The ← → buttons, the slider or the ← → keys step
   through every version of the Council since 1848 (94 so far). The
   navigator stays at the top of the screen while you scroll through the
   whole page; once the big score has scrolled past (above the screen),
   it shows the score next to the dates ("75 % Gesamtübereinstimmung"),
   but not while you read the intro above it. It keeps one height for every
   version (on phones the dates always take two lines, and below about
   900 px the score always gets its own line). Below the overall score,
   one box shows the seven members (portrait, name, "party · canton"; by
   seniority). The canton is shown as its flag (`site/img/flags/`, see
   "Canton flags" below), about as tall as the text, with the canton's name
   on hover and for screen readers.

   Names are short to keep the page calm: languages as ISO 639-1 codes (DE,
   FR, IT, RM; "Andere" for other languages) and parties by their
   abbreviation ("Mitte" for Die Mitte, "FDP" for FDP.Die Liberalen). Cards show
   the party as named at the time (e.g. "freis.", "CVP", "BDP"). The bar
   tooltips use the full names.

   **Replacing a member who is leaving.** A member of today's Council who
   has announced their resignation is highlighted (light red) and has an
   "Ersetzen" button. That is
   anyone with a `left_office_date` in the future in
   `data/all_federal_councillors.csv` (currently Guy Parmelin, 31 December
   2026). To offer it for another member, enter the date they leave office
   there and rerun `scripts/build_data.py`. Once the date has passed, they
   are no longer in today's Council and the button disappears with them.
   Past Councils cannot be changed. The button opens an editor ("Wer
   ersetzt …?") with three ways to choose the new person:

   - **Selbst zusammenstellen:** set gender, party (the parties with at
     least 1 % in that period's National Council election), language and
     age yourself. Starts with the replaced member's profile.
   - **Offizielle Kandidierende:** pick a person from
     `data/candidates.csv` (see "Official candidates" below), shown as
     cards like the Council's (portrait, name, party · flag) in a grid that
     grows with the number of people (no scrolling inside the box). Their
     age is calculated for the version shown; only people who would have
     been 18 or older are offered. The new member's card shows their portrait.
   - **Bestmögliche Person:** the app tries every combination of gender,
     party, language, age group and Grossregion for this seat (with the other members as
     they are) and shows a profile with the highest overall score. If
     several profiles are equally good, clicking again shows the next one
     ("Variante 2 von 3"). Ages are the middle of the age group.

   The modes share one profile: after picking a person or a best profile,
   "Selbst zusammenstellen" shows it and lets you adjust it. Every change
   updates the editor's live result (overall score and the five
   comparisons, with the difference to the real Council) and all bars on the
   page. If several members are leaving, each can be replaced; each
   replacement can be undone on its card ("Rückgängig"). Nothing is saved:
   reloading the page shows the real Councils.
2. **The comparison:** how closely the Council matches the population by
   **gender, party, language, age and Herkunft nach Grossregion**. The
   overall score ("Gesamtübereinstimmung des Bundesrats mit der
   Bevölkerung", directly below the navigator) is the average of the five,
   shown in whole percent; each comparison has its own box with its score
   (one decimal) and two bars (Council vs population). Everything updates
   with every step in the navigator. The intro text above (behind "Mehr
   lesen") explains the measure.

   At the bottom, the **history chart** ("Verlauf seit 1848") is a step line chart of the
   overall score and the five comparisons for every version of the Council
   (x: time, y: 0–100 %). Each step is one version; the selected one is
   shaded, with a dot on each line. Hovering shows all values of a version,
   clicking selects it (the whole page follows). The chart shows the real
   Councils, without replacements made in the editor. The party line
   starts in 1919.

   By default the overall score is the strong black line and the five
   comparisons are thinner and lighter. One line can be emphasized ("focus
   + context": it keeps its colour and comes to the front, all others turn
   light gray): hover a legend entry to preview it, click (tap) it to keep
   it until clicked again.

The footer of every page links to three more pages: **Quellen**
(`quellen.html`: data sources and picture credits, built from
`data/data.json`), the **Datenschutzerklärung** (`datenschutz.html`) and
**Kontakt** (`kontakt.html`). Each has a "Zurück zur Übersicht" button at
the top. The email address on these pages is protected from spam bots (`js/email.js`): the
page shows "name [at] domain" and puts the real address together only when
it is clicked.

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

## Texts (intro, method)

Longer texts on the main page are written in Markdown, one file per
language, in `site/content/<language>/`:

| File | Shown |
|---|---|
| `site/content/de/intro.md` | the page title (its `#` line) and the intro below it |

To change a text, edit its file; no code needs to change. To add a new
text, put an element with `data-content="<name>"` into the page
(`<div class="prose" data-content="method" hidden></div>`) and create
`site/content/de/<name>.md`; `js/content.js` fills it in. For another
language, copy the folder (`site/content/fr/`) and translate the files.
`scripts/check_site.py` checks that every text exists in every language
folder.

Supported Markdown (a small renderer in `js/content.js`, so the page
still loads nothing from other websites):

| Write | Becomes |
|---|---|
| a blank line | a new paragraph (single line breaks are spaces) |
| `# Title` | the page title (h1); use it once, in `intro.md` |
| `## Kicker` directly above `# Title` | the small grey line above the title |
| `## Heading`, `### Heading` | a heading (h2, h3) |
| `- item` or `1. item` at the start of lines | a list |
| `**bold**`, `*italic*` or `_italic_`, `` `code` `` | **bold**, *italic*, `code` |
| ```` ``` ```` on its own line, the code, ```` ``` ```` again | a code block, shown exactly as written |
| `---` | a dividing line |
| `[text](https://…)` or `[text](quellen.html)` | a link |
| `+++ Mehr lesen` | a link with this label; the text after it stays hidden until the link is pressed, up to a line with just `+++` (or to the end of the file). The link then reads "Weniger" (`readLess` in `i18n.js`) and hides the text again; `+++ Mehr lesen \| Weniger anzeigen` sets that label in the file |

A space before `%` (or none: `51%`) becomes a non-breaking space, so
"28.6 %" never breaks across lines. Links to other websites open in a
new tab (here and on the Quellen and Datenschutz pages). Anything else, including HTML, is
shown as plain text. Short texts
(buttons, labels, the consent banner) stay in `site/js/i18n.js`; the
privacy policy is its own page (`site/datenschutz.html`).

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

## Official candidates ("Offizielle Kandidierende")

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
| `canton` | Canton, as in the councillor list (`Zürich`, `Waadt`, `Tessin`, …): shown as its flag and used for the Grossregion |

The script stops with a message pointing to the line if a value is missing
or unknown. While the file has no rows, the page says "Noch keine
offiziellen Kandidierenden erfasst."

Portraits come from Wikidata, like the councillors' (next section):
`scripts/fetch_wikidata.py` finds each person by name (and birth date, if
several people share the name) and saves the picture as
`site/img/candidates/<name>.jpg`, with author and licence in
`data/wikidata_candidates.json`. A person without a picture gets their
initials. Pictures already there are kept, so a photo cropped by hand
stays (Pierre Alain Schnegg: head and shoulders cut from a CC0 event photo).

## Canton flags

```bash
python3 scripts/fetch_flags.py   # then: python3 scripts/build_data.py
```

Downloads the 26 canton flags from Wikimedia Commons (the files of the
German Wikipedia "Liste der Wappen und Fahnen der Schweizer Kantone"; all
public domain) to `site/img/flags/<code>.svg`, with author and licence in
`data/flags.json` for the Quellen page. `scripts/check_site.py` checks that
the flag of every canton shown exists.

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
credits under "Bildnachweise" on the page "Quellen" (several licences, e.g.
CC BY-SA, require this).

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
| Grossregion | `canton` in the CSV → its Grossregion | Population by canton, summed per Grossregion: censuses from table su-t-vz15-ch-01 "Bevölkerungsentwicklung nach Grossregionen und Kantonen 1850-2000" until 1970, then the permanent resident population on 31 December, STAT-TAB `px-x-0102020000_101` | 1850; censuses until 1970, yearly since 1971 |

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
- **Grossregion:** the seven Grossregionen of the BFS
  ([definition](https://www.bfs.admin.ch/asset/de/5933503)):
  Genferseeregion (VD, VS, GE), Espace Mittelland (BE, FR, SO, NE, JU),
  Nordwestschweiz (BS, BL, AG), Zürich (ZH), Ostschweiz (GL, SH, AR, AI,
  SG, GR, TG), Zentralschweiz (LU, UR, SZ, OW, NW, ZG) and Tessin (TI);
  `GROSSREGIONEN` in `build_data.py`. A councillor counts for the canton in
  the CSV. The census table is an old Excel file (.xls), read by
  `xls_rows()` in `build_data.py` with the standard library. Both sources
  are read by canton and summed per region; until 1970 the bar label says
  "Volkszählung", e.g. "Volkszählung 1920". The census (Wohnbevölkerung)
  and the yearly statistics (ständige Wohnbevölkerung) count slightly
  differently, so the figures step a little between 1970 and 1971.
- **Colours:** all comparisons use one categorical palette (custom
  properties at the top of `style.css`). Parties are shown left to right in
  their usual colours where possible: SP red, Mitte amber, FDP blue, SVP
  green; other parties with a seat follow in this order: GRÜNE aqua, GLP
  violet, BDP and any other party magenta; "Übrige Parteien" light grey.
  Languages: German blue, French orange, Italian aqua, Romansh amber, other
  languages light grey. Age is ordered, so it uses one hue (light to dark
  blue). Grossregionen: Genferseeregion blue, Espace Mittelland orange,
  Nordwestschweiz aqua, Zürich violet, Ostschweiz amber, Zentralschweiz
  green, Tessin magenta. For every bar, the order of its colours was
  checked for colour-blind separation. In the history chart, the overall
  score is a thick black line; gender, party, language, age and Grossregion
  use blue, orange, aqua, amber and dark blue.
- **Hover on the Council bars:** lists the members in that part of the bar
  by last name; in the age comparison with their age on the day the version
  is measured, e.g. "Parmelin (66)".

## Project structure

```
data/
  all_federal_councillors.csv   source data: every councillor since 1848
  candidates.csv                people for "Offizielle Kandidierende" (you fill this in)
  wikidata.json                 written by fetch_wikidata.py
  wikidata_candidates.json      written by fetch_wikidata.py (candidates' portraits)
  flags.json                    written by fetch_flags.py (credits of the flags)
scripts/
  build_data.py                 builds site/data/data.json (CSV + BFS API)
  check_site.py                 checks before deploying (run by the pipeline)
  fetch_wikidata.py             birth dates, languages, portraits (Wikidata)
  fetch_flags.py                canton flags (Wikimedia Commons)
  serve.py                      local web server without browser caching
site/                           the web app (static files; this folder is published)
  index.html                    page structure (main page)
  quellen.html                  sources and picture credits
  datenschutz.html              privacy policy
  kontakt.html                  contact
  _headers                      browser caching rules (Cloudflare Pages)
  css/style.css                 all styling (design tokens at the top)
  js/app.js                     loads data, builds the page, browsing
  js/council.js                 versions of the Council
  js/comparisons.js             the five comparisons (categories, BFS data)
  js/chart.js                   step line chart for "Verlauf seit 1848" (SVG)
  js/metrics.js                 the score calculation (no DOM code)
  js/i18n.js                    all visible text + number/date formatting
  js/analytics.js               consent banner + Google Analytics events
  js/config.js                  Google Analytics ID (written by the pipeline)
  js/sources.js                 fills quellen.html from data.json
  js/email.js                   email address hidden from spam bots
  js/content.js                 longer texts: loads and renders the Markdown files
  content/de/intro.md           page title and intro text (Markdown)
  data/data.json                generated by build_data.py
  img/                          portraits (written by fetch_wikidata.py; candidates/ too)
  img/flags/                    canton flags (written by fetch_flags.py)
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
| `history_focus` | a line pinned / unpinned in the legend of the history chart | `series` (overall, gender, party, language, age, region), `action` (pin, unpin) |
| `read_more` | "Mehr lesen" / "Weniger" pressed in a text | `text` (e.g. intro), `action` (open, close) |
| `replace_open` / `replace_edit` | "Ersetzen" / "Bearbeiten" on a card | `councillor`, `council_start` |
| `replace_mode` | one of the three modes chosen | `mode` (custom, list, best); for best also the profile |
| `best_next` | next of several best profiles | `variant`, `variants`, profile |
| `replace_field` | gender, party, language, age or Grossregion changed | `field`, `choice` (age: when the slider is let go) |
| `candidate_select` | a person picked from the list | `candidate`, `party` |
| `replace_done` | editor closed ("Fertig" or Escape) | `method`, `councillor`, `council_start`, profile, `score_change` |
| `replace_undo` | "Rückgängig" on a card | `councillor`, `council_start` |

"Profile" means `mode`, `gender`, `party`, `language`, `age`, `age_group`,
`region`, and `candidate` for a person from the list. `score_change` is the change in
the overall score of the Council with all replacements, in percentage points,
compared with the real Council. No parameter says anything about the visitor.

To use a parameter in the reports, register it once per property: Admin →
Data display → Custom definitions → Create custom dimension (scope "Event",
same name as the parameter). For `age`, `score_change`, `variant`
and `variants` create a custom metric instead.

## Next iterations

- **Language switcher:** add a `"fr-CH"` (etc.) block to `site/js/i18n.js` and
  a button that calls `setLanguage()` and re-renders.

## Sources

- Population by sex and age: Federal Statistical Office (BFS), STAT-TAB table
  [px-x-0102030000_101](https://www.pxweb.bfs.admin.ch/pxweb/de/px-x-0102030000_101/-/px-x-0102030000_101.px/)
- Main languages: BFS, table T 01.08.01.01 "Hauptsprachen seit 1910"; for
  the breakdown of other languages, table T 01.08.01.02 "Hauptsprachen nach
  Grossregion und Kanton"
- Party strength: BFS, table T 17.02.02.03.01 "Nationalratswahlen: Stärke
  der Parteien"
- Grossregionen: BFS [definition](https://www.bfs.admin.ch/asset/de/5933503);
  population by canton from table su-t-vz15-ch-01 "Bevölkerungsentwicklung
  nach Grossregionen und Kantonen 1850-2000" and STAT-TAB table
  [px-x-0102020000_101](https://www.pxweb.bfs.admin.ch/pxweb/de/px-x-0102020000_101/-/px-x-0102020000_101.px/)
  "Demografische Bilanz nach Kanton"
- Federal Council: `data/all_federal_councillors.csv`
- Birth dates, languages and portraits of the councillors, portraits of
  the candidates: [Wikidata](https://www.wikidata.org/) and
  [Wikimedia Commons](https://commons.wikimedia.org/)
- Canton flags: [Wikimedia Commons](https://commons.wikimedia.org/), as used in
  the German Wikipedia "Liste der Wappen und Fahnen der Schweizer Kantone"
  (public domain)
- Font: [Inter](https://fonts.google.com/specimen/Inter) by Rasmus Andersson
  (The Inter Project Authors), SIL Open Font License 1.1 (`site/fonts/OFL.txt`). The files from Google
  Fonts are stored in `site/fonts/` and served with the site, so every device
  shows the same font and visitors' browsers don't contact Google. Upright
  (`inter-latin*.woff2`) and the true italics (`inter-italic-latin*.woff2`,
  for *italic* in the Markdown texts; only downloaded when a page shows italics).

## Image licences

The portraits in `site/img/` are **not** covered by this project's own
licence. Each image keeps the licence it was published under on Wikimedia
Commons (public domain, Creative Commons, or free use with attribution).
Author, licence and source of every image are listed in
`data/wikidata.json`, `data/wikidata_candidates.json` and `data/flags.json`
(canton flags, all public domain), and on the Quellen page under
"Bildnachweise". Keep these
credits when reusing or redistributing the images.
