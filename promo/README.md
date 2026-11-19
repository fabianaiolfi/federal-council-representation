# LinkedIn video: "Wer ersetzt Guy Parmelin?"

A self-playing animation (about 26 seconds) to record as a video for
LinkedIn. It is **not part of the website**: this folder is not published.

What it shows:

1. **0–4.6 s:** the question "Wer ersetzt Guy Parmelin?" and today's
   Gesamtübereinstimmung.
2. **4.6–16.4 s:** the official candidates one by one, with the
   Gesamtübereinstimmung if they replaced him (a bar to the left of the line
   "heute" means lower, to the right higher); then sorted.
3. **16.4–21.6 s:** the best possible person, as "Bestmögliche Person" on
   the website.
4. **From 21.6 s:** the end card with bundesrat.fyi, a note that this is not a
   voting recommendation, and the photo credits.

The numbers are calculated from `site/data/data.json` with the website's own
code (`site/js/comparisons.js`, `council.js`, `metrics.js`). They were checked
against the website's editor (all candidates and the best person match).
The leaving member and the candidates come from the data, so the video
updates itself when the data changes.

## Open it

The page needs the files in `site/`, so serve the whole repository (not
just `site/`):

```bash
python3 -m http.server 8000      # in the repository folder
```

Then open <http://localhost:8000/promo/video.html> in Chrome.

| Key | Action |
|---|---|
| Space | play / pause |
| R | back to the start (paused) |
| ← → | one second back / forward |

URL parameters: `?t=12.5` shows that moment, `?play` starts at once,
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
3. Click **Record**, then press **Space** on the page. Stop the recording
   (stop button in the menu bar) once the end card has been shown for about
   three seconds.
4. Open the file in **QuickTime Player**: Edit → Trim to cut the start
   and the end. File → Export As → 1080p.
5. Upload the file directly to LinkedIn (not as a YouTube link).

If the recording stutters, close other apps and try again; or render it
frame by frame (`window.renderAt(t)` draws any moment, for a script with
Puppeteer and ffmpeg).

## Photo credits

The end card names the photographers of the portraits shown (most need
attribution: "Parlamentsdienste", "Schweizerische Bundeskanzlei"). Keep
the end card in the video, or name them in the post.
