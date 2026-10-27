/**
 * app.js — loads data/data.json, does the calculations (metrics.js) and
 * fills the page (index.html). All text comes from i18n.js.
 *
 * Pattern (no framework needed at this size):
 *   - `base`  : everything that never changes, computed once from the data
 *   - `state` : what the user picked (successor gender per departing member)
 *   - setup*(): build the page once
 *   - update(): recompute the scenario from `state` and refresh the numbers
 *               and bars. Called on start and on every change of `state`.
 */

import { t, fmt, getLanguage } from "./i18n.js";
import { overlap, toShares, countByGender, inOfficeOn, withSuccessors } from "./metrics.js";

const SEATS = 7; // constitutional size of the Federal Council (Art. 175 BV)
const CATEGORIES = ["female", "male"]; // display order everywhere

/** User choices: member number -> "today" | "female" | "male". */
const state = { choices: {} };
let base; // set in main()

// Small helpers ------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

/** Create an element with optional class and text (text is never parsed as HTML). */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Today's date as "YYYY-MM-DD" in the visitor's local time zone. */
function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Karin Keller-Sutter" -> "KK" (first letter of first and last name). */
function initials(name) {
  const parts = name.split(/\s+/);
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Data & model ---------------------------------------------------------------------

async function loadData() {
  const res = await fetch("data/data.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** The fixed part: current members, population shares, today's score. */
function computeBase(data, day) {
  // Current members, ordered by seniority (earliest election first).
  const members = inOfficeOn(data.councillors, day).sort(
    (a, b) => a.electionDate.localeCompare(b.electionDate) || a.number - b.number
  );

  const pop = data.population;
  const populationCounts = { female: pop.women, male: pop.men };
  const q = toShares(populationCounts);

  return {
    day,
    members,
    // Members with a known leaving date: these seats can be "re-filled"
    // in the scenario picker.
    departures: members.filter((m) => m.leftOfficeDate),
    population: pop,
    populationCounts,
    q,
    todayScore: overlap(toShares(countByGender(members)), q),
    generated: data.generated,
  };
}

/** The changing part: the Council after applying the user's choices. */
function computeScenario(choices) {
  const members = withSuccessors(base.members, choices);
  const counts = countByGender(members);
  const p = toShares(counts);
  return {
    counts,
    p,
    score: overlap(p, base.q),
    isChanged: Object.values(choices).some((c) => c !== "today"),
  };
}

// Setup: build the page once -----------------------------------------------------

/** Fill every element that has a data-i18n="key" attribute. */
function setupStaticText() {
  document.documentElement.lang = getLanguage();
  document.title = t("pageTitle");
  document.querySelector('meta[name="description"]').content = t("pageDescription");
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
}

function setupCouncil() {
  $("council-subtitle").textContent = t("councilSubtitle", fmt.date(base.day));

  const cards = base.members.map((c) => {
    const li = el("li", "member");
    const avatar = el("span", `avatar avatar-${c.gender}`, initials(c.name));
    avatar.setAttribute("aria-hidden", "true");

    const body = el("div", "member-body");
    const gender = t(c.gender === "female" ? "femaleSingular" : "maleSingular");
    body.append(
      el("p", "member-name", c.name),
      el("p", "member-meta", `${c.party} · ${c.canton}`),
      el("p", "member-meta", t("councilSince", gender, c.electionDate.slice(0, 4)))
    );
    if (c.leftOfficeDate) {
      body.append(el("p", "member-leaving", t("councilLeaving", fmt.dateShort(c.leftOfficeDate))));
    }
    li.append(avatar, body);
    return li;
  });
  $("council-list").replaceChildren(...cards);

  // Safety net: if the CSV is not up to date (e.g. a successor is missing),
  // say so instead of silently comparing a 6-member Council.
  const warning = $("council-warning");
  warning.hidden = base.members.length === SEATS;
  if (!warning.hidden) warning.textContent = t("councilWarning", base.members.length);
}

/**
 * Scenario picker: one radio group per departing member, styled as a
 * segmented control. Radios keep it accessible (arrow keys, screen readers).
 */
function setupScenarios() {
  const options = [
    { value: "today", label: t("scenarioToday") },
    { value: "female", label: t("scenarioFemale") },
    { value: "male", label: t("scenarioMale") },
  ];

  const groups = base.departures.map((m) => {
    state.choices[m.number] = "today";

    const fieldset = el("fieldset", "scenario");
    fieldset.append(
      el("legend", null, t("scenarioQuestion", m.name)),
      el("p", "scenario-hint", t("councilLeaving", fmt.date(m.leftOfficeDate)))
    );

    const segmented = el("div", "segmented");
    for (const o of options) {
      const label = el("label");
      const input = el("input");
      input.type = "radio";
      input.name = `successor-${m.number}`;
      input.value = o.value;
      input.checked = o.value === "today";
      input.addEventListener("change", () => {
        state.choices[m.number] = o.value;
        update();
      });
      const text = el("span");
      if (o.value !== "today") text.append(el("span", `key key-${o.value}`));
      text.append(document.createTextNode(o.label));
      label.append(input, text);
      segmented.append(label);
    }
    fieldset.append(segmented);
    return fieldset;
  });
  $("scenarios").replaceChildren(...groups);
}

/** A legend: coloured key + label for each category. */
function setupLegend(listEl) {
  listEl.replaceChildren(
    ...CATEGORIES.map((c) => {
      const li = el("li");
      li.append(el("span", `key key-${c}`), document.createTextNode(t(c)));
      return li;
    })
  );
}

/**
 * Two aligned 100 % bars (Council vs population). The DOM is built once and
 * only updated afterwards, so CSS can animate the segment widths.
 * Segments are sized with flex-grow, so the 2px gap between them never
 * pushes the total past 100 %.
 */
function setupBars() {
  setupLegend($("compare-legend"));

  const rows = ["council", "population"].map((key) => {
    const row = el("div", "bar-row");
    row.dataset.row = key;

    const head = el("div", "bar-head");
    head.append(el("span", "bar-name"), el("span", "bar-values"));

    const bar = el("div", "bar");
    for (const c of CATEGORIES) {
      const seg = el("div", `seg seg-${c}`);
      seg.dataset.category = c;
      seg.tabIndex = 0;
      bar.append(seg);
    }
    row.append(head, bar);
    return row;
  });
  $("compare-bars").replaceChildren(...rows);
}

/** Fill one bar row with shares, counts and tooltip texts. */
function updateBarRow(key, name, shares, detailFor) {
  const row = document.querySelector(`.bar-row[data-row="${key}"]`);
  row.querySelector(".bar-name").textContent = name;
  row.querySelector(".bar-values").textContent = CATEGORIES.map(
    (c) => `${t(c)} ${fmt.pct(shares[c])}`
  ).join(" · ");

  for (const seg of row.querySelectorAll(".seg")) {
    const c = seg.dataset.category;
    seg.hidden = shares[c] === 0;
    seg.style.flexGrow = shares[c];
    seg.dataset.value = fmt.pct(shares[c]);
    seg.dataset.label = `${t(c)} · ${name}`;
    seg.dataset.detail = detailFor(c);
    seg.setAttribute("aria-label", `${seg.dataset.label}: ${seg.dataset.value}, ${seg.dataset.detail}`);
  }
}

function setupFooter() {
  const link = $("source-population");
  link.textContent = t("sourcePopulation", base.population.table);
  link.href = base.population.url;
  $("data-generated").textContent = t("dataGenerated", fmt.date(base.generated));
}

/** One shared tooltip for all bar segments; works on hover and keyboard focus. */
function setupTooltip() {
  const tip = $("tooltip");

  function show(seg, x, y) {
    tip.replaceChildren(
      el("strong", null, seg.dataset.value),
      el("span", null, seg.dataset.label),
      el("span", "tooltip-detail", seg.dataset.detail)
    );
    tip.hidden = false;
    // Keep the tooltip inside the viewport.
    const pad = 12;
    const { width, height } = tip.getBoundingClientRect();
    const left = Math.min(Math.max(pad, x - width / 2), window.innerWidth - width - pad);
    const top = y - height - pad < pad ? y + pad * 2 : y - height - pad;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }
  const hide = () => (tip.hidden = true);

  const bars = $("compare-bars");
  bars.addEventListener("pointermove", (e) => {
    const seg = e.target.closest(".seg");
    seg ? show(seg, e.clientX, e.clientY) : hide();
  });
  bars.addEventListener("pointerleave", hide);
  bars.addEventListener("focusin", (e) => {
    const seg = e.target.closest(".seg");
    if (!seg) return;
    const r = seg.getBoundingClientRect();
    show(seg, r.left + r.width / 2, r.top);
  });
  bars.addEventListener("focusout", hide);
  window.addEventListener("scroll", hide, { passive: true });
}

// Update: runs on start and whenever the scenario changes -------------------------

let shownScore = null; // the value currently displayed (mid-animation too)
let scoreFrame = 0;

/** Count the big number from its current value to `to` (0..1). */
function animateScore(to) {
  const node = $("score-value");
  cancelAnimationFrame(scoreFrame);
  const from = shownScore ?? to;
  if (from === to || prefersReducedMotion()) {
    shownScore = to;
    node.textContent = fmt.pct(to);
    return;
  }
  const start = performance.now();
  const duration = 500; // ms
  const step = (now) => {
    const k = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - k, 3); // ease-out
    shownScore = from + (to - from) * eased;
    node.textContent = fmt.pct(shownScore);
    if (k < 1) scoreFrame = requestAnimationFrame(step);
  };
  scoreFrame = requestAnimationFrame(step);
}

function update() {
  const s = computeScenario(state.choices);

  // Big number + change versus today
  animateScore(s.score);
  // (The line stays in the layout when empty, so the bars below don't jump.)
  const delta = $("score-delta");
  delta.textContent = "";
  if (s.isChanged) {
    const diff = (s.score - base.todayScore) * 100;
    const direction = Math.abs(diff) < 0.05 ? 0 : Math.sign(diff);
    delta.textContent = t("scoreDelta", fmt.dec(Math.abs(diff)), direction);
  }

  // Bars
  const seats = s.counts.female + s.counts.male;
  updateBarRow(
    "council",
    t(s.isChanged ? "compareCouncilScenario" : "compareCouncilToday"),
    s.p,
    (c) => t("tooltipOf", s.counts[c], seats)
  );
  updateBarRow(
    "population",
    t("comparePopulation", base.population.year),
    base.q,
    (c) => t("tooltipPersons", fmt.int(base.populationCounts[c]))
  );

  // Screen readers: announce the final result once (not every animation frame)
  $("score-status").textContent = `${t("scoreLabel")}: ${fmt.pct(s.score)}${
    s.isChanged ? `, ${delta.textContent}` : ""
  }`;
}

// Start --------------------------------------------------------------------------

async function main() {
  setupStaticText();
  try {
    const data = await loadData();
    base = computeBase(data, todayIso());
    setupCouncil();
    setupScenarios();
    setupBars();
    setupFooter();
    setupTooltip();
    update();
  } catch (err) {
    console.error(err);
    const box = $("load-error");
    box.textContent = t("loadError");
    box.hidden = false;
  }
}

main();
