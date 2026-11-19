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
 * The first and the last frame are the same (today's value, Guy Parmelin),
 * so the video can play in a loop; the first frame also works as a still. Keys: Space plays / pauses, R goes back to the
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

/** When each candidate takes Guy Parmelin's place (seconds) */
const STEPS = [1.8, 4.0, 6.2];

/** When the video goes back to the start (Parmelin, today's value) */
const END = 8.8;

/** One beat of the arrow after the address (seconds; must divide DURATION) */
const PULSE = 2.5;

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
  const council = buildVersions(data.councillors).find(
    (c) => c.start <= day && (!c.end || c.end >= day),
  );
  const seat = council.members.find(
    (m) => m.leftOfficeDate && m.leftOfficeDate > day,
  );
  const others = council.members.filter((m) => m !== seat);
  const score = (members) =>
    average(comparisons.map((cmp) => evaluate(cmp, members, day)));
  // The new member keeps the seat; gender, party, language, age and region change
  const withPerson = (p) =>
    score([
      ...others,
      { ...seat, ...p, parties: [{ party: p.party, from: null }] },
    ]);

  const people = PEOPLE.map((name) => {
    const p = data.candidates.find((c) => c.name === name);
    if (!p) throw new Error(`${name} is not in data/candidates.csv`);
    if (ageOn(p.birthDate, day) < 18)
      throw new Error(`${name} is under 18 on ${day}`);
    return { ...p, overall: withPerson(p) };
  });
  const party = comparisons.find((cmp) => cmp.key === "party");
  return {
    seat,
    today: score(council.members),
    people,
    partyLabel: (p) => party.choiceLabel(p),
  };
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
    const author =
      /Parliamentary Services|Services du Parlement|Assemblea Federale|Parlamentsdienste/i.test(
        raw,
      )
        ? "Parlamentsdienste"
        : raw || "Urheber unbekannt";
    const label = p.portrait?.license === "CC0" ? `${author} (CC0)` : author;
    if (!authors.includes(label)) authors.push(label);
  }
  return `Fotos: ${authors.join("; ")}, via Wikimedia Commons`;
}

// --- The video -----------------------------------------------------------------------

/**
 * Builds the DOM once and returns render(t).
 *
 * Always on screen: the address (www.bundesrat.fyi), the title, the
 * Gesamtübereinstimmung box and the credits. Below them, one person at a time: first Guy Parmelin (today),
 * then each candidate in his place, then Parmelin again, so the last frame
 * is the same as the first and the video loops without a jump.
 */
function build(stage, m) {
  const { seat, today, people, partyLabel } = m;

  // The address, made to look like a link: with an arrow pointing right
  // (as on the website's buttons: square line ends)
  const url = el("p", "url");
  url.append(el("span", null, "www.bundesrat.fyi"));
  url.insertAdjacentHTML(
    "beforeend",
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
  );
  const arrow = url.lastElementChild;

  const title = el(
    "h1",
    "title",
    "Wie gut bildet der Bundesrat die Bevölkerung ab?",
  );

  // The Gesamtübereinstimmung: today, then with each candidate
  const scoreBox = el("div", "box score-box");
  const context = el("p", "score-context");
  const value = el("p", "score-value");
  scoreBox.append(
    el("p", "score-label", "Gesamtübereinstimmung"),
    context,
    value,
    el(
      "p",
      "score-caption",
      "Durchschnitt aus Geschlecht, Partei, Sprache, Alter und Herkunft nach Grossregion",
    ),
    el(
      "p",
      "score-caption",
      "100 % = gleiche Zusammensetzung wie die Bevölkerung",
    ),
  );

  // One person at a time, in the same place below
  const slot = el("div", "slot");
  const card = (p, { className = "", note, change }) => {
    const box = el("div", `box person ${className}`);
    const who = el("div", "who");
    const meta = el("p", "meta");
    meta.append(
      flag(p.cantonCode, p.canton),
      partyLabel(p.party ?? p.parties.at(-1).party),
    );
    who.append(el("p", "name", p.name), meta);
    if (note) who.append(el("p", "note", note));
    box.append(portrait(p), who);
    if (change !== undefined) {
      const result = el("div", "result");
      result.append(
        el("strong", null, points(change)),
        el("span", null, "Prozentpunkte"),
      );
      box.append(result);
    }
    slot.append(box);
    return box;
  };
  // Slot 0: Guy Parmelin, who is leaving (light red, as on the website)
  const slides = [
    {
      box: card(seat, {
        className: "is-leaving",
        note: `Tritt am ${fmt.date(seat.leftOfficeDate)} zurück`,
      }),
      overall: today,
      context: `Heute, mit ${seat.name}`,
    },
    ...people.map((p) => ({
      box: card(p, { change: p.overall - today }),
      overall: p.overall,
      context: `Mit ${p.name} statt ${seat.name}`,
    })),
  ];

  const credit = el("p", "credits", credits([seat, ...people]));
  stage.append(url, title, scoreBox, slot, credit);

  // From one person to the next: [time, from slide, to slide]
  const changes = STEPS.map((at, i) => [at, i, i + 1]);
  changes.push([END, people.length, 0]); // back to the start

  return function render(t) {
    // The arrow after the address moves 3 px to the right and back. One
    // beat every 2.5 s (four per round), at rest at 0 s and 10 s, so the
    // loop stays seamless.
    const beat = (1 - Math.cos((2 * Math.PI * t) / PULSE)) / 2;
    arrow.style.transform = `translateX(${3 * beat}px)`;

    // Before the first change: Parmelin and today's value, standing still
    let [at, from, to] = [0, 0, 0];
    for (const c of changes) if (t >= c[0]) [at, from, to] = c;
    const still = from === to;
    // The old box fades out in place, then the new one rises in
    const leave = still ? 1 : easeInOut(seg(t, at, at + 0.25));
    const enter = still ? 1 : easeOut(seg(t, at + 0.2, at + 0.6));
    const move = still ? 1 : easeInOut(seg(t, at + 0.15, at + 0.95)); // the number

    slides.forEach((s, i) => {
      const style = s.box.style;
      if (i === to) {
        style.opacity = enter;
        style.transform = `translateY(${(1 - enter) * 18}px)`;
      } else if (i === from && !still) {
        style.opacity = 1 - leave;
        style.transform = "none";
      } else {
        style.opacity = 0;
      }
    });

    const a = slides[from].overall;
    const b = slides[to].overall;
    value.textContent = fmt.pct(a + (b - a) * move);
    context.textContent = slides[to].context;
    show(context, still ? 1 : seg(t, at, at + 0.35), 6);
  };
}

// --- Playback ------------------------------------------------------------------------

async function main() {
  const params = new URLSearchParams(location.search);
  const local = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const day =
    params.get("today") ??
    `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
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
    if (playing && last !== null)
      time = (time + (now - last) / 1000) % DURATION;
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
