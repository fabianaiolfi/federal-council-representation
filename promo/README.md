# LinkedIn video: "Wie gut bildet der Bundesrat die Bevölkerung ab?"

A self-playing animation (10 seconds, loops seamlessly) to record as a
video for LinkedIn. It is **not part of the website**: this folder is not
published.

What it shows:

| Time | |
|---|---|
| always | the address "www.bundesrat.fyi →" (every 2.5 s the arrow moves gently to the right and back), the title "Wie gut bildet der Bundesrat die Bevölkerung ab?", the box "Gesamtübereinstimmung" with its value and the two explanations from the website ("Durchschnitt aus …", "100 % = …"), and at the bottom the photo credits |
| 0 s | today's value, and below it Guy Parmelin (light red, with the day he leaves office): the first frame also works as a still, since LinkedIn doesn't always play videos by itself |
| 1.8 s | the first candidate takes Parmelin's place: their box (large portrait, name, flag, party, change in percentage points) replaces his, and the value moves to the Gesamtübereinstimmung with them |
| 4.0 s | the second candidate |
| 6.2 s | the third candidate |
| 8.8 s | back to Guy Parmelin and today's value |
| 10 s | the same picture as at 0 s: the video can play in a loop without a visible jump |

The three people and their order are set in `promo/video.js` (`PEOPLE`,
names as in `data/candidates.csv`; `STEPS`: when each one appears; `END`:
when the video returns to the start).

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
4. Open the file in **QuickTime Player**: Edit → Trim. Start at the moment
   you pressed Space and end exactly one or more rounds (10 seconds each)
   later, while Guy Parmelin is shown. File → Export As → 1080p.
5. Upload the file directly to LinkedIn (not as a YouTube link).

If the recording stutters, close other apps and try again; or render it
frame by frame (`window.renderAt(t)` draws any moment, for a script with
Puppeteer and ffmpeg).

## Photo credits

The line at the bottom names the photographers of the portraits shown
(Schweizerische Bundeskanzlei, Parlamentsdienste; their licences ask for
attribution). Keep it in the
video, or name them in the post.
