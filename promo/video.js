/**
 * video.js — a self-playing animation (about 26 seconds) for a LinkedIn
 * video: who replaces Guy Parmelin, and how each official candidate would
 * change the Gesamtübereinstimmung.
 *
 * The numbers are calculated from site/data/data.json with the website's
 * own building blocks (the five comparisons, the versions of the Council,
 * the overlap score). Only the few lines that combine them (evaluate,
 * average) are repeated here, as in site/js/app.js, which does not export
 * them.
 *
 * Everything on screen is a function of the time t (seconds): render(t).
 * Keys: Space plays / pauses, R goes back to the start, ← → step by one
 * second. URL parameters: ?t=12.5 shows that moment, ?play starts at once,
 * ?today=2026-11-19 calculates for that day (default: today).
 */

import { buildComparisons, ageOn } from "../site/js/comparisons.js";
import { buildVersions } from "../site/js/council.js";
import { overlap, toShares } from "../site/js/metrics.js";
import { t as text, fmt } from "../site/js/i18n.js";

const SITE = "../site/";
const DURATION = 26.5;

// --- The numbers (as in site/js/app.js) -------------------------------------------

function evaluate(cmp, members, day) {
  const categories = cmp.categories(members, day);
  const pop = cmp.population(day, categories);
  if (!pop) return { available: false };
  const counts = Object.fromEntries(categories.map((c) => [c, 0]));
  for (const m of members) counts[cmp.categoryOf(m, day)] += 1;
  const q = Object.fromEntries(categories.map((c) => [c, pop.values[c] ?? 0]));
  return { available: true, score: overlap(toShares(counts), toShares(q)) };
}

function average(results) {
  const scores = results.filter((r) => r.available).map((r) => r.score);
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Today's Council, the member who is leaving (left_office_date in the
 * future), the overall score with each official candidate in their seat,
 * and the best possible profiles (as "Bestmögliche Person" on the site).
 */
function calculate(data, day) {
  const comparisons = buildComparisons(data);
  const byKey = Object.fromEntries(comparisons.map((cmp) => [cmp.key, cmp]));
  const council = buildVersions(data.councillors).find((c) => c.start <= day && (!c.end || c.end >= day));
  const seat = council.members.find((m) => m.leftOfficeDate && m.leftOfficeDate > day);
  const others = council.members.filter((m) => m !== seat);
  const score = (members) => average(comparisons.map((cmp) => evaluate(cmp, members, day)));
  // The new member keeps the seat; gender, party, language, age and region change
  const withPerson = (p) =>
    score([...others, { ...seat, ...p, parties: [{ party: p.party, from: null }] }]);

  const candidates = data.candidates
    .filter((p) => ageOn(p.birthDate, day) >= 18)
    .map((p) => ({ ...p, overall: withPerson(p) }));

  // Best possible person: every combination, ages in the middle of their group
  const ages = data.age.groups.map((g) => (g.max === null ? g.min + 5 : Math.round((g.min + g.max) / 2)));
  let best = { overall: -Infinity, profiles: [] };
  for (const gender of byKey.gender.choices(day))
    for (const party of byKey.party.choices(day))
      for (const language of byKey.language.choices(day))
        for (const age of ages)
          for (const region of byKey.region.choices(day)) {
            const birthDate = `${Number(day.slice(0, 4)) - age}${day.slice(4)}`;
            const profile = { gender, party, language, age, region, birthDate };
            const overall = withPerson(profile);
            if (overall > best.overall + 1e-9) best = { overall, profiles: [profile] };
            else if (Math.abs(overall - best.overall) <= 1e-9) best.profiles.push(profile);
          }

  return { day, byKey, seat, today: score(council.members), candidates, best };
}

// --- Small helpers ---------------------------------------------------------------

const clamp = (x) => Math.min(1, Math.max(0, x));
/** Progress from 0 to 1 while t goes from a to b */
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (x) => 1 - (1 - x) ** 3;
const easeInOut = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

/** Fade in and rise by `dy` px as p goes from 0 to 1 */
function show(node, p, dy = 14) {
  const e = easeOut(p);
  node.style.opacity = e;
  node.style.transform = `translateY(${(1 - e) * dy}px)`;
}

/** "+1.3" / "−0.4" / "±0.0" percentage points */
function points(share) {
  const pp = share * 100;
  if (Math.abs(pp) < 0.05) return `±${fmt.dec(0)}`;
  return `${pp > 0 ? "+" : "−"}${fmt.dec(Math.abs(pp))}`;
}

function flag(code, canton) {
  const img = el("img", "flag");
  img.src = `${SITE}img/flags/${code}.svg`;
  img.alt = text("cantonFlag", canton);
  return img;
}

function portrait(p, className = "portrait") {
  const img = el("img", className);
  img.src = SITE + p.portrait.image;
  img.alt = "";
  return img;
}

/** "Bundeskanzlei; Parlamentsdienste; Bricetofly (CC0)": who took the photos */
function credits(people) {
  const authors = [];
  for (const p of people) {
    const raw = p.portrait?.author ?? "";
    // The Parliamentary Services sign in German, French, Italian or English
    const author = /Parliamentary Services|Services du Parlement|Assemblea Federale|Parlamentsdienste/i.test(raw)
      ? "Parlamentsdienste"
      : raw || "Urheber unbekannt";
    const label = p.portrait?.license === "CC0" ? `${author} (CC0)` : author;
    if (!authors.includes(label)) authors.push(label);
  }
  return `Fotos via Wikimedia Commons: ${authors.join("; ")}. Porträt Pierre Alain Schnegg zugeschnitten. Kantonsfahnen gemeinfrei.`;
}

// --- The scenes ----------------------------------------------------------------------

/** Builds the DOM once and returns render(t) */
function build(stage, m) {
  const { byKey, seat, candidates, best } = m;
  const partyLabel = (party) => byKey.party.choiceLabel(party);
  const scenes = [];
  const scene = (className = "") => {
    const node = el("div", `scene ${className}`);
    stage.append(node);
    scenes.push(node);
    return node;
  };

  // 1. The question and today's score (0 – 4.6 s)
  const s1 = scene();
  const s1eyebrow = el("p", "eyebrow", "bundesrat.fyi");
  const s1title = el("h1", "title", `Wer ersetzt ${seat.name}?`);
  const leaving = el("div", "box leaving");
  const leavingPerson = el("div", "person");
  const leavingText = el("div");
  const leavingMeta = el("p", "meta");
  leavingMeta.append(flag(seat.cantonCode, seat.canton), partyLabel(seat.parties.at(-1).party));
  leavingText.append(
    el("p", "name", seat.name),
    leavingMeta,
    el("p", "meta", `Tritt am ${fmt.date(seat.leftOfficeDate)} zurück`)
  );
  leavingPerson.append(portrait(seat), leavingText);
  leaving.append(leavingPerson);
  const scoreBox = el("div", "box score-box");
  const scoreValue = el("p", "score-value", fmt.pct(0));
  scoreBox.append(
    el("p", "score-label", "Gesamtübereinstimmung des Bundesrats mit der Bevölkerung heute"),
    scoreValue,
    el("p", "score-caption", "Durchschnitt aus Geschlecht, Partei, Sprache, Alter und Herkunft nach Grossregion")
  );
  s1.append(s1eyebrow, s1title, leaving, scoreBox);

  // 2. The candidates, one row each (4.6 – 16.4 s)
  const s2 = scene();
  const s2title = el("h2", "title title-small", "Und mit den offiziellen Kandidierenden?");
  const s2sub = el("p", "subline", `Gesamtübereinstimmung, wenn sie ${seat.name} ersetzen`);
  const ranking = el("div", "box ranking");
  const head = el("div", "ranking-head");
  head.append(el("span"), el("span"), el("span", "head-ref", `heute ${fmt.pct(m.today)}`), el("span", "head-value", "neu"));
  const rows = el("div", "rows");
  const ROW = 54;
  rows.style.height = `${candidates.length * ROW}px`;
  const maxChange = Math.max(...candidates.map((p) => Math.abs(p.overall - m.today)), 0.001);
  const order = [...candidates].sort((a, b) => b.overall - a.overall);
  const rowNodes = candidates.map((p, i) => {
    const row = el("div", "row");
    const who = el("div");
    const meta = el("p", "meta");
    meta.append(flag(p.cantonCode, p.canton), partyLabel(p.party));
    who.append(el("p", "name", p.name), meta);
    const change = el("div", "change");
    const bar = el("div", "change-bar");
    change.append(el("div", "reference"), bar);
    const value = el("div", "value");
    const valueNumber = el("strong");
    const valueDelta = el("span");
    value.append(valueNumber, valueDelta);
    row.append(portrait(p), who, change, value);
    rows.append(row);
    return { row, bar, valueNumber, valueDelta, p, from: i, to: order.indexOf(p) };
  });
  ranking.append(head, rows);
  s2.append(s2title, s2sub, ranking);

  // 3. The best possible person (16.4 – 21.6 s)
  const s3 = scene();
  const profile = best.profiles[0];
  const top = order[0];
  const s3title = el("h2", "title title-small", "Und die bestmögliche Person?");
  const s3sub = el(
    "p",
    "subline",
    "Die Website probiert alle Kombinationen aus Geschlecht, Partei, Sprache, Alter und Grossregion aus."
  );
  const bestBox = el("div", "box best");
  const bestPerson = el("div", "person");
  const avatar = el("span", "avatar", text("newShort").toUpperCase());
  avatar.style.background = `var(--${profile.gender})`;
  const bestText = el("div");
  bestText.append(
    el("p", "name", `${text(profile.gender === "female" ? "femaleSingular" : "maleSingular")}, ${profile.age} Jahre`),
    el("p", "meta", [
      byKey.region.choiceLabel(profile.region),
      partyLabel(profile.party),
      profile.language === "other" ? text("languageName_otherSingular") : text(`languageName_${profile.language}`),
    ].join(" · "))
  );
  bestPerson.append(avatar, bestText);
  const bestValue = el("p", "best-value", fmt.pct(m.today));
  const bestDelta = el("p", "best-delta", `${points(best.overall - m.today)} Prozentpunkte gegenüber heute`);
  const bestCompare = el(
    "p",
    "best-compare",
    `Zum Vergleich, die höchste offizielle Kandidatur: ${top.name}, ${fmt.pct(top.overall)}`
  );
  bestBox.append(bestPerson, bestValue, bestDelta, bestCompare);
  const s3note = el(
    "p",
    "note",
    best.profiles.length > 1
      ? `Eine von ${best.profiles.length} gleich guten Varianten. Mit nur sieben Sitzen sind 100 % fast nie erreichbar.`
      : "Mit nur sieben Sitzen sind 100 % fast nie erreichbar."
  );
  s3.append(s3title, s3sub, bestBox, s3note);

  // 4. End card (from 21.6 s)
  const s4 = scene("end");
  const s4title = el("h2", "title title-small", "Wie gut bildet der Bundesrat die Bevölkerung ab?");
  const url = el("p", "box url", "bundesrat.fyi");
  const s4sub = el(
    "p",
    "subline",
    "Alle Zusammensetzungen seit 1848 vergleichen und Mitglieder selbst ersetzen."
  );
  const disclaimer = el(
    "p",
    "disclaimer",
    "Gemessen wird nur die deskriptive Repräsentation: Geschlecht, Partei, Sprache, Alter und Herkunft nach Grossregion. Keine Wahlempfehlung."
  );
  const credit = el("p", "credits", credits([seat, ...candidates]));
  s4.append(s4title, url, s4sub, disclaimer, credit);

  // --- The timeline ---
  const windows = [
    [0, 4.6],
    [4.6, 16.4],
    [16.4, 21.6],
    [21.6, Infinity],
  ];

  return function render(t) {
    // Scenes cross-fade (0.4 s)
    scenes.forEach((node, i) => {
      const [a, b] = windows[i];
      const fadeIn = i === 0 ? 1 : seg(t, a, a + 0.4);
      const fadeOut = b === Infinity ? 0 : seg(t, b - 0.4, b); // the end card stays
      const o = Math.min(fadeIn, 1 - fadeOut);
      node.style.opacity = o;
      node.style.visibility = o > 0 ? "visible" : "hidden";
    });

    // 1
    show(s1eyebrow, seg(t, 0, 0.4));
    show(s1title, seg(t, 0.1, 0.7), 20);
    show(leaving, seg(t, 0.8, 1.3));
    show(scoreBox, seg(t, 1.4, 1.9));
    scoreValue.textContent = fmt.pct(m.today * easeOut(seg(t, 1.6, 2.8)));

    // 2
    show(s2title, seg(t, 4.7, 5.2), 20);
    show(s2sub, seg(t, 4.9, 5.4));
    show(ranking, seg(t, 5.2, 5.6));
    const sort = easeInOut(seg(t, 13.0, 14.3));
    for (const r of rowNodes) {
      const start = 5.7 + 0.85 * r.from;
      const p = seg(t, start, start + 0.35);
      const grow = easeOut(seg(t, start + 0.25, start + 1.05));
      const y = (r.from + (r.to - r.from) * sort) * ROW;
      r.row.style.opacity = easeOut(p);
      r.row.style.transform = `translate(${(1 - easeOut(p)) * 18}px, ${y}px)`;
      const change = r.p.overall - m.today;
      const width = (Math.abs(change) / maxChange) * 56 * grow;
      r.bar.style.width = `${width}px`;
      r.bar.style.left = change >= 0 ? "50%" : `calc(50% - ${width}px)`;
      r.valueNumber.textContent = fmt.pct(m.today + change * grow);
      r.valueDelta.textContent = points(change * grow);
    }

    // 3
    show(s3title, seg(t, 16.5, 17.0), 20);
    show(s3sub, seg(t, 16.7, 17.2));
    show(bestBox, seg(t, 17.3, 17.8));
    bestValue.textContent = fmt.pct(m.today + (best.overall - m.today) * easeOut(seg(t, 17.7, 18.9)));
    show(bestDelta, seg(t, 18.6, 19.0), 8);
    show(bestCompare, seg(t, 19.3, 19.8), 8);
    show(s3note, seg(t, 19.9, 20.4), 8);

    // 4
    show(s4title, seg(t, 21.7, 22.2), 20);
    show(url, seg(t, 22.2, 22.8), 20);
    show(s4sub, seg(t, 22.9, 23.4));
    show(disclaimer, seg(t, 23.4, 23.9));
    show(credit, seg(t, 23.6, 24.1), 0);
  };
}

// --- Playback ------------------------------------------------------------------------

async function main() {
  const params = new URLSearchParams(location.search);
  const local = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const day = params.get("today") ?? `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
  const data = await (await fetch(`${SITE}data/data.json`)).json();
  const model = calculate(data, day);
  const render = build(document.getElementById("stage"), model);
  await document.fonts.ready;

  let time = Math.min(Number(params.get("t") ?? 0), DURATION);
  let playing = params.has("play");
  let last = null;
  const clock = document.getElementById("clock");

  function frame(now) {
    if (playing && last !== null) time = Math.min(DURATION, time + (now - last) / 1000);
    if (time >= DURATION) playing = false;
    last = now;
    render(time);
    clock.textContent = `${time.toFixed(1)} s / ${DURATION} s${playing ? "" : " (Pause)"}`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  document.addEventListener("keydown", (e) => {
    if (e.key === " ") {
      e.preventDefault();
      if (!playing && time >= DURATION) time = 0;
      playing = !playing;
    } else if (e.key === "r" || e.key === "R") {
      time = 0;
      playing = false;
    } else if (e.key === "ArrowLeft") {
      time = Math.max(0, time - 1);
    } else if (e.key === "ArrowRight") {
      time = Math.min(DURATION, time + 1);
    }
  });

  // For checking single frames (or rendering frame by frame later)
  window.renderAt = (t) => render(t);
  window.videoModel = model;
}

main();
