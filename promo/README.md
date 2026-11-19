# LinkedIn video: "Wie gut bildet der Bundesrat die Bevölkerung ab?"

A self-playing animation (10 seconds, loops seamlessly) to record as a
video for LinkedIn. It is **not part of the website**: this folder is not
published.

What it shows:

| Time | |
|---|---|
| always | "bundesrat.fyi", the title "Wie gut bildet der Bundesrat die Bevölkerung ab?", and at the bottom the photo credits and "keine Wahlempfehlung" |
| 0.3 s | the box "Gesamtübereinstimmung": today's value |
| 1.8 s | Thomas Aeschi's box appears below; the value changes to the Gesamtübereinstimmung with him instead of Guy Parmelin, with the change in percentage points |
| 4.0 s | the same for Céline Amaudruz |
| 6.2 s | the same for Marco Chiesa |
| 8.8–9.6 s | everything but the title fades out |
| 10 s | the same picture as at 0 s: the video can play in a loop without a visible jump |

The three people and their order are set in `promo/video.js` (`PEOPLE`,
names as in `data/candidates.csv`; `STEPS`: when each box appears).

The numbers are calculated from `site/data/data.json` with the website's own
code (`site/js/comparisons.js`, `council.js`, `metrics.js`). They were checked
against the website's editor (all candidates match).
The leaving member and the candidates' details come from the data, so the
video updates itself when the data changes.

## Open it

The page needs the files in `site/`, so serve the whole repository (not
just `site/`):

```bash
python3 -m http.server 8000      # in the repository folder
```

Then open <http://localhost:8000/promo/video.html> in Chrome.

| Key | Action |
|---|---|
| Space | play / pause (plays in a loop) |
| R | back to the start (paused) |
| ← → | one second back / forward |

URL parameters: `?t=4.5` shows that moment, `?play` starts at once,
`?today=2026-11-19` calculates for that day (default: today).

## Record it (macOS, no extra software)

The video area (light grey) is 540 × 675 points. On a Retina screen (every
current Mac) that is exactly **1080 × 1350 pixels: 4:5 portrait**, the size
LinkedIn recommends for the feed.

1. Open the page, make the browser window big enough to show the whole
   grey area, and press **R**.
2. Press **Cmd + Shift + 5**, choose **"Record Selected Portion"**, and
   drag the frame exactly around the grey area (it snaps to nothing, so
   zoom in on the corners; a few pixels of dark border can be cut later).
3. Click **Record**, then press **Space** on the page. Let it play once
   (10 seconds) or a few times, then stop the recording (stop button in
   the menu bar).
4. Open the file in **QuickTime Player**: Edit → Trim. Start where the
   "Gesamtübereinstimmung" box begins to appear, and end after one or more
   full rounds, just before the box appears again (in between, only the
   title is visible). File → Export As → 1080p.
5. Upload the file directly to LinkedIn (not as a YouTube link).

If the recording stutters, close other apps and try again; or render it
frame by frame (`window.renderAt(t)` draws any moment, for a script with
Puppeteer and ffmpeg).

## Photo credits

The line at the bottom names the photographers of the portraits shown
(the Parlamentsdienste; the licence asks for attribution). Keep it in the
video, or name them in the post.
