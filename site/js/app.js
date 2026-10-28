/**
 * app.js — loads data/data.json, does the calculations and fills the page
 * (index.html). All text comes from i18n.js.
 *
 * Pattern (no framework needed at this size):
 *   - `base`  : everything that never changes, computed once from the data
 *               (all compositions of the Council since 1848 with their scores)
 *   - `state` : what the user picked — which composition is shown, and the
 *               successor gender per departing member (scenario)
 *   - setup*(): build the page once
 *   - update(): show the composition/scenario described by `state`.
 *               Called on start and on every change of `state`.
 */

import { t, fmt, getLanguage } from "./i18n.js";
import { overlap, toShares, countByGender } from "./metrics.js";
import { buildCompositions, populationFor, withSuccessors } from "./council.js";

const CATEGORIES = ["female", "male"]; // display order everywhere

const state = {
  index: 0, // which composition is shown (0 = 1848)
  choices: {}, // scenario: member number -> "today" | "female" | "male"
};
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

/** Shares and score of a list of members against one population year. */
function measure(members, pop) {
  const counts = countByGender(members);
  const p = toShares(counts);
  const populationCounts = { female: pop.women, male: pop.men };
  const q = toShares(populationCounts);
  return { counts, p, populationCounts, q, score: overlap(p, q) };
}

/**
 * The fixed part: every composition since 1848 (up to today), each with
 * the population of the year it took office and its score.
 */
function computeBase(data, today) {
  const compositions = buildCompositions(data.councillors)
    .filter((c) => c.start <= today)
    .map((c) => {
      const pop = populationFor(data.population.years, Number(c.start.slice(0, 4)));
      return { ...c, pop, ...measure(c.members, pop) };
    });

  // The composition in office today (-1 if today has an empty seat,
  // e.g. a successor is missing in the CSV).
  const currentIndex = compositions.findIndex(
    (c) => c.start <= today && (!c.end || c.end >= today)
  );
  const current = compositions[currentIndex];

  return {
    today,
    compositions,
    currentIndex,
    // Current members with a known leaving date: these seats can be
    // "re-filled" in the scenario picker.
    departures: current ? current.members.filter((m) => m.leftOfficeDate) : [],
    population: data.population,
    generated: data.generated,
  };
}

/** Everything that is shown for the current `state`. */
function computeView() {
  const i = state.index;
  const c = base.compositions[i];
  const isCurrent = i === base.currentIndex;
  const isScenario = isCurrent && Object.values(state.choices).some((x) => x !== "today");

  // Scenario: same population year, members with successors swapped in.
  const shown = isScenario ? { ...c, ...measure(withSuccessors(c.members, state.choices), c.pop) } : c;

  // The change shown under the big number: versus today in a scenario,
  // otherwise versus the previous composition.
  const reference = isScenario ? c : base.compositions[i - 1];
  return {
    composition: c,
    previous: base.compositions[i - 1],
    isCurrent,
    isScenario,
    ...shown,
    delta: reference ? shown.score - reference.score : null,
    deltaReference: isScenario ? "today" : "previous",
  };
}

/** Short label for a composition's time in office: "2019 – 2022", "2025 – heute". */
function periodLabel(c, isCurrent) {
  const from = c.start.slice(0, 4);
  if (isCurrent) return t("periodCurrent", from);
  const to = c.end.slice(0, 4);
  if (from !== to) return t("periodYears", from, to);
  // Within one year: "2023" for a full calendar year, else "März – Juli 1912"
  if (c.start.endsWith("-01-01") && c.end.endsWith("-12-31")) return from;
  return t("periodMonths", fmt.month(c.start), fmt.month(c.end), from);
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

/** Previous/next buttons and slider; all of them just change state.index. */
function setupNavigator() {
  const nav = $("navigator");
  const range = $("nav-range");
  nav.setAttribute("aria-label", t("navLabel"));
  $("nav-prev").setAttribute("aria-label", t("navPrev"));
  $("nav-next").setAttribute("aria-label", t("navNext"));
  range.setAttribute("aria-label", t("navSlider"));
  range.max = base.compositions.length - 1;

  const go = (index) => {
    state.index = Math.min(Math.max(index, 0), base.compositions.length - 1);
    update();
  };
  $("nav-prev").addEventListener("click", () => go(state.index - 1));
  $("nav-next").addEventListener("click", () => go(state.index + 1));
  range.addEventListener("input", () => go(Number(range.value)));

  nav.hidden = false;

  // Show the score in the bar only while the big number is off screen.
  // The negative top margin excludes the area covered by the sticky bar.
  new IntersectionObserver(
    ([entry]) => nav.classList.toggle("show-score", !entry.isIntersecting),
    { rootMargin: `-${nav.offsetHeight}px 0px 0px 0px` }
  ).observe($("score-value"));
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
      el("p", "scenario-hint", t("memberLeaving", fmt.date(m.leftOfficeDate)))
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

// Update: runs on start and whenever `state` changes ---------------------------------

function updateNavigator(v) {
  const label = periodLabel(v.composition, v.isCurrent);
  $("nav-period").textContent = label;
  const range = $("nav-range");
  range.value = state.index;
  range.setAttribute("aria-valuetext", label);
  $("nav-prev").disabled = state.index === 0;
  $("nav-next").disabled = state.index === base.compositions.length - 1;
}

/** Member cards of the shown composition. */
function updateCouncil(v) {
  const c = v.composition;
  $("council-subtitle").textContent = v.isCurrent
    ? t("councilSince", fmt.date(c.start))
    : t("councilFromTo", fmt.date(c.start), fmt.date(c.end));

  // Members who were not in the previous composition get a "Neu" badge.
  const previousMembers = new Set(v.previous ? v.previous.members.map((m) => m.number) : []);

  const cards = c.members.map((m) => {
    const li = el("li", "member");
    const avatar = el("span", `avatar avatar-${m.gender}`, initials(m.name));
    avatar.setAttribute("aria-hidden", "true");

    const body = el("div", "member-body");
    const gender = t(m.gender === "female" ? "femaleSingular" : "maleSingular");
    const from = m.electionDate.slice(0, 4);
    const hasLeft = m.leftOfficeDate && m.leftOfficeDate < base.today;
    body.append(
      el("p", "member-name", m.name),
      el("p", "member-meta", `${m.party} · ${m.canton}`),
      el(
        "p",
        "member-meta",
        hasLeft
          ? t("memberTenure", gender, from, m.leftOfficeDate.slice(0, 4))
          : t("memberSince", gender, from)
      )
    );

    const badges = [];
    if (v.previous && !previousMembers.has(m.number)) {
      badges.push(el("span", "badge badge-new", t("memberNew")));
    }
    if (v.isCurrent && m.leftOfficeDate) {
      badges.push(el("span", "badge", t("memberLeaving", fmt.dateShort(m.leftOfficeDate))));
    }
    if (badges.length) {
      const row = el("p", "member-badges");
      row.append(...badges);
      body.append(row);
    }

    li.append(avatar, body);
    return li;
  });
  $("council-list").replaceChildren(...cards);

  // Safety net: if the CSV is not up to date (e.g. a successor is missing),
  // say so when the latest composition is shown.
  const isLatest = state.index === base.compositions.length - 1;
  const warning = $("council-warning");
  warning.hidden = !(isLatest && base.currentIndex === -1);
  warning.textContent = t("councilWarning");
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

let shownScore = null; // the value currently displayed (mid-animation too)
let scoreFrame = 0;

/** Count the big number (and the one in the navigator) to `to` (0..1). */
function animateScore(to) {
  const paint = (value) => {
    $("score-value").textContent = fmt.pct(value);
    $("nav-score").textContent = fmt.pct(value);
  };
  cancelAnimationFrame(scoreFrame);
  const from = shownScore ?? to;
  if (from === to || prefersReducedMotion()) {
    shownScore = to;
    paint(to);
    return;
  }
  const start = performance.now();
  const duration = 450; // ms
  const step = (now) => {
    const k = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - k, 3); // ease-out
    shownScore = from + (to - from) * eased;
    paint(shownScore);
    if (k < 1) scoreFrame = requestAnimationFrame(step);
  };
  scoreFrame = requestAnimationFrame(step);
}

function updateComparison(v) {
  // Scenario picker only makes sense for the Council in office today.
  $("scenarios").hidden = !v.isCurrent;

  // Big number + change (the line stays in the layout when empty, so the
  // bars below don't jump).
  animateScore(v.score);
  const delta = $("score-delta");
  delta.textContent = "";
  if (v.delta !== null) {
    const pp = v.delta * 100;
    const direction = Math.abs(pp) < 0.05 ? 0 : Math.sign(pp);
    delta.textContent = t("scoreDelta", fmt.dec(Math.abs(pp)), direction, v.deltaReference);
  }

  // Bars
  const seats = v.counts.female + v.counts.male;
  updateBarRow(
    "council",
    v.isScenario
      ? t("compareCouncilScenario")
      : t("compareCouncil", periodLabel(v.composition, v.isCurrent)),
    v.p,
    (c) => t("tooltipOf", v.counts[c], seats)
  );
  updateBarRow(
    "population",
    t("comparePopulation", v.pop.year),
    v.q,
    (c) => t("tooltipPersons", fmt.int(v.populationCounts[c]))
  );

  // Screen readers: announce the final result once (not every animation frame)
  $("score-status").textContent = [`${t("scoreLabel")}: ${fmt.pct(v.score)}`, delta.textContent]
    .filter(Boolean)
    .join(", ");
}

function update() {
  const v = computeView();
  updateNavigator(v);
  updateCouncil(v);
  updateComparison(v);
}

// Start --------------------------------------------------------------------------

async function main() {
  setupStaticText();
  try {
    const data = await loadData();
    base = computeBase(data, todayIso());
    // Start with today's Council (or the latest one if today has a gap).
    state.index = base.currentIndex >= 0 ? base.currentIndex : base.compositions.length - 1;
    setupNavigator();
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
