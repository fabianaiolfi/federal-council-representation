/**
 * video.js — a self-playing animation (10 seconds, loops seamlessly) for a
 * LinkedIn video: how the Gesamtübereinstimmung would change if Guy
 * Parmelin were replaced by one of three official candidates.
 *
 * The numbers are calculated from site/data/data.json with the website's
 * own building blocks (the five comparisons, the versions of the Council,
 * the overlap score). Only the few lines that combine them (evaluate,
 * average) are repeated here, as in site/js/app.js, which does not export
 * them.
 *
 * Everything on screen is a function of the time t (seconds): render(t).
 * The first and the last frame are the same (only the title), so the
 * video can play in a loop. Keys: Space plays / pauses, R goes back to the
 * start, ← → step by one second. URL parameters: ?t=4.5 shows that moment,
 * ?play starts at once, ?today=2026-11-19 calculates for that day
 * (default: today).
 */

import { buildComparisons, ageOn } from "../site/js/comparisons.js";
import { buildVersions } from "../site/js/council.js";
import { overlap, toShares } from "../site/js/metrics.js";
import { t as text, fmt } from "../site/js/i18n.js";

const SITE = "../site/";
const DURATION = 10;

/** The candidates shown, in this order (names as in data/candidates.csv) */
const PEOPLE = ["Thomas Aeschi", "Céline Amaudruz", "Marco Chiesa"];

/** When each candidate's box appears (seconds) */
const STEPS = [1.8, 4.0, 6.2];

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
 * future), and the overall score with each chosen candidate in that seat.
 */
function calculate(data, day) {
  const comparisons = buildComparisons(data);
  const council = buildVersions(data.councillors).find((c) => c.start <= day && (!c.end || c.end >= day));
  const seat = council.members.find((m) => m.leftOfficeDate && m.leftOfficeDate > day);
  const others = council.members.filter((m) => m !== seat);
  const score = (members) => average(comparisons.map((cmp) => evaluate(cmp, members, day)));
  // The new member keeps the seat; gender, party, language, age and region change
  const withPerson = (p) => score([...others, { ...seat, ...p, parties: [{ party: p.party, from: null }] }]);

  const people = PEOPLE.map((name) => {
    const p = data.candidates.find((c) => c.name === name);
    if (!p) throw new Error(`${name} is not in data/candidates.csv`);
    if (ageOn(p.birthDate, day) < 18) throw new Error(`${name} is under 18 on ${day}`);
    return { ...p, overall: withPerson(p) };
  });
  const party = comparisons.find((cmp) => cmp.key === "party");
  return { seat, today: score(council.members), people, partyLabel: (p) => party.choiceLabel(p) };
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

/** "+0.9" / "−5.8" / "±0.0" percentage points */
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

function portrait(p) {
  const img = el("img", "portrait");
  img.src = SITE + p.portrait.image;
  img.alt = "";
  return img;
}

/** "Parlamentsdienste; Bricetofly (CC0)": who took the photos shown */
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
  return `Fotos: ${authors.join("; ")}, via Wikimedia Commons · Gemessen wird nur die deskriptive Repräsentation, keine Wahlempfehlung.`;
}

// --- The video -----------------------------------------------------------------------

/** Builds the DOM once and returns render(t) */
function build(stage, m) {
  const { seat, today, people, partyLabel } = m;

  // Always there (first and last frame): address, title, credits
  const top = el("div", "top");
  top.append(
    el("p", "eyebrow", "bundesrat.fyi"),
    el("h1", "title", "Wie gut bildet der Bundesrat die Bevölkerung ab?")
  );

  // The Gesamtübereinstimmung: today, then with each candidate
  const scoreBox = el("div", "box score-box");
  const context = el("p", "score-context", "Heute");
  const value = el("p", "score-value");
  const change = el("p", "score-change");
  scoreBox.append(el("p", "score-label", "Gesamtübereinstimmung"), context, value, change);

  // One box per candidate, below
  const list = el("div", "people");
  const boxes = people.map((p) => {
    const box = el("div", "box candidate");
    const who = el("div", "who");
    const meta = el("p", "meta");
    meta.append(flag(p.cantonCode, p.canton), partyLabel(p.party));
    who.append(el("p", "name", p.name), meta);
    const result = el("div", "result");
    result.append(el("strong", null, fmt.pct(p.overall)), el("span", null, points(p.overall - today)));
    box.append(portrait(p), who, result);
    list.append(box);
    return box;
  });

  const credit = el("p", "credits", credits(people));
  stage.append(top, scoreBox, list, credit);

  return function render(t) {
    // Everything but the title fades out at the end, back to the first frame
    const out = 1 - easeInOut(seg(t, 8.8, 9.6));

    show(scoreBox, seg(t, 0.3, 0.9));
    scoreBox.style.opacity = Number(scoreBox.style.opacity) * out;

    // The current step: -1 = today, 0..2 = with that candidate
    let step = -1;
    STEPS.forEach((start, i) => {
      if (t >= start) step = i;
    });
    const from = step <= 0 ? today : people[step - 1].overall;
    const to = step < 0 ? today : people[step].overall;
    const move = step < 0 ? 1 : easeInOut(seg(t, STEPS[step] + 0.2, STEPS[step] + 1.0));
    value.textContent = fmt.pct(from + (to - from) * move);
    context.textContent = step < 0 ? "Heute" : `Mit ${people[step].name} statt ${seat.name}`;
    change.textContent = step < 0 ? "" : `${points(people[step].overall - today)} Prozentpunkte gegenüber heute`;
    show(change, step < 0 ? 0 : seg(t, STEPS[step] + 0.6, STEPS[step] + 1.0), 6);
    if (step >= 0) show(context, seg(t, STEPS[step], STEPS[step] + 0.35), 6);
    else show(context, 1, 0);

    // Candidate boxes: appear one after another; the current one is
    // outlined in black, the earlier ones recede
    boxes.forEach((box, i) => {
      show(box, seg(t, STEPS[i], STEPS[i] + 0.45), 18);
      const active = i === step;
      box.classList.toggle("is-active", active);
      box.style.opacity = Number(box.style.opacity) * (active ? 1 : 0.5) * out;
    });
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
    // Plays in a loop: the last frame is the same as the first
    if (playing && last !== null) time = (time + (now - last) / 1000) % DURATION;
    last = now;
    render(time);
    clock.textContent = `${time.toFixed(1)} s / ${DURATION} s${playing ? "" : " (Pause)"}`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  document.addEventListener("keydown", (e) => {
    if (e.key === " ") {
      e.preventDefault();
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
