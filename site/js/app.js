/**
 * app.js — loads data/data.json, does the calculations (metrics.js) and
 * fills the page (index.html). All text comes from i18n.js.
 *
 * Flow:  loadData() -> computeModel() -> render*() functions
 */

import { t, fmt, getLanguage } from "./i18n.js";
import { overlap, toShares, bestPossible, inOfficeOn } from "./metrics.js";

const SEATS = 7; // constitutional size of the Federal Council (Art. 175 BV)
const CATEGORIES = ["female", "male"]; // display order everywhere

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

// Data & model ---------------------------------------------------------------------

async function loadData() {
  const res = await fetch("data/data.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Everything the page shows, calculated once from the raw data. */
function computeModel(data, day) {
  // Current members, ordered by seniority (earliest election first).
  const members = inOfficeOn(data.councillors, day).sort(
    (a, b) => a.electionDate.localeCompare(b.electionDate) || a.number - b.number
  );

  const councilCounts = { female: 0, male: 0 };
  for (const m of members) councilCounts[m.gender] += 1;

  const pop = data.population;
  const populationCounts = { female: pop.women, male: pop.men };

  const p = toShares(councilCounts); // Council shares
  const q = toShares(populationCounts); // population shares

  return {
    day,
    members,
    councilCounts,
    populationCounts,
    population: pop,
    generated: data.generated,
    p,
    q,
    score: overlap(p, q),
    best: bestPossible(q, SEATS, "female", "male"),
  };
}

// Rendering ----------------------------------------------------------------------

/** Fill every element that has a data-i18n="key" attribute. */
function renderStaticText() {
  document.documentElement.lang = getLanguage();
  document.title = t("pageTitle");
  document.querySelector('meta[name="description"]').content = t("pageDescription");
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
}

/** A legend: coloured key + label for each category. */
function renderLegend(listEl) {
  listEl.replaceChildren(
    ...CATEGORIES.map((c) => {
      const li = el("li");
      li.append(el("span", `key key-${c}`), document.createTextNode(t(c)));
      return li;
    })
  );
}

function renderScore(m) {
  const score = fmt.pct(m.score);
  const best = fmt.pct(m.best.score);

  $("score-value").textContent = score;

  // Meter: black fill up to the score, a tick at the best possible value.
  $("meter-fill").style.width = `${m.score * 100}%`;
  $("meter-tick").style.left = `${m.best.score * 100}%`;
  $("meter-tick-label").textContent = t("scoreCeilingTick", best);
  $("score-meter").setAttribute("aria-label", t("scoreMeterLabel", score, best));

  $("score-ceiling").textContent = t(
    "scoreCeiling",
    best,
    m.best.focusSeats,
    SEATS - m.best.focusSeats,
    SEATS
  );
}

function renderCouncil(m) {
  $("council-subtitle").textContent = t("councilSubtitle", fmt.date(m.day));
  renderLegend($("council-legend"));

  // One card per member. The coloured initials disc doubles as a unit chart:
  // count the colours and you see the gender split at a glance.
  const cards = m.members.map((c) => {
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
    li.append(avatar, body);
    return li;
  });
  $("council-list").replaceChildren(...cards);

  $("council-summary").textContent = t(
    "councilSummary",
    m.councilCounts.female,
    m.councilCounts.male,
    fmt.pct(m.p.female)
  );

  // Safety net: if the CSV is not up to date (e.g. a successor is missing),
  // say so instead of silently comparing a 6-member Council.
  const warning = $("council-warning");
  warning.hidden = m.members.length === SEATS;
  if (!warning.hidden) warning.textContent = t("councilWarning", m.members.length);
}

function renderPopulation(m) {
  $("population-subtitle").textContent = t("populationSubtitle", m.population.year);

  const stats = CATEGORIES.map((c) => {
    const box = el("div", "stat");
    const label = el("p", "stat-label");
    label.append(el("span", `key key-${c}`), document.createTextNode(t(c)));
    box.append(
      label,
      el("p", "stat-value", fmt.pct(m.q[c])),
      el("p", "stat-detail", t("populationPersons", fmt.int(m.populationCounts[c])))
    );
    return box;
  });
  $("population-stats").replaceChildren(...stats);

  const total = m.populationCounts.female + m.populationCounts.male;
  $("population-total").textContent = t("populationTotal", fmt.int(total));
}

/**
 * Two aligned 100 % bars (Council vs population). Segments are sized with
 * flex-grow so the 2px gap between them never pushes the total past 100 %.
 */
function renderComparison(m) {
  renderLegend($("compare-legend"));

  const rows = [
    { label: t("compareCouncil"), shares: m.p, counts: m.councilCounts, unit: "seats" },
    { label: t("comparePopulation"), shares: m.q, counts: m.populationCounts, unit: "people" },
  ];

  const nodes = rows.map((row) => {
    const wrap = el("div", "bar-row");

    // Values above the bar, in black text: women left, men right.
    const head = el("div", "bar-head");
    head.append(el("span", "bar-name", row.label));
    const values = el("span", "bar-values");
    values.append(
      el("span", null, `${t("female")} ${fmt.pct(row.shares.female)}`),
      el("span", "sep", " · "),
      el("span", null, `${t("male")} ${fmt.pct(row.shares.male)}`)
    );
    head.append(values);

    const bar = el("div", "bar");
    for (const c of CATEGORIES) {
      if (row.shares[c] === 0) continue;
      const seg = el("div", `seg seg-${c}`);
      seg.style.flexGrow = row.shares[c];
      seg.tabIndex = 0;

      // Tooltip content: value first, then what it is.
      const total = row.counts.female + row.counts.male;
      const detail =
        row.unit === "seats"
          ? t("tooltipOf", row.counts[c], total)
          : t("populationPersons", fmt.int(row.counts[c]));
      seg.dataset.value = fmt.pct(row.shares[c]);
      seg.dataset.label = `${t(c)} · ${row.label}`;
      seg.dataset.detail = detail;
      seg.setAttribute("aria-label", `${seg.dataset.label}: ${seg.dataset.value}, ${detail}`);
      bar.append(seg);
    }

    wrap.append(head, bar);
    return wrap;
  });
  $("compare-bars").replaceChildren(...nodes);

  // Text summary of the gap (in percentage points) and in seats.
  const diff = (m.p.female - m.q.female) * 100;
  const direction = Math.abs(diff) < 0.05 ? 0 : Math.sign(diff);
  $("compare-gap").textContent = t("compareGap", fmt.dec(Math.abs(diff)), direction);
  $("compare-seats").textContent = t(
    "compareSeats",
    fmt.dec(m.q.female * SEATS),
    SEATS,
    m.councilCounts.female
  );
}

function renderMethod(m) {
  const tbody = document.querySelector("#method-table tbody");
  const tfoot = document.querySelector("#method-table tfoot");

  tbody.replaceChildren(
    ...CATEGORIES.map((c) => {
      const tr = el("tr");
      const th = el("th");
      th.scope = "row";
      th.append(el("span", `key key-${c}`), document.createTextNode(t(c)));
      const lower = Math.min(m.p[c], m.q[c]);
      tr.append(
        th,
        el("td", m.p[c] === lower ? "is-min" : null, fmt.pct(m.p[c])),
        el("td", m.q[c] === lower ? "is-min" : null, fmt.pct(m.q[c])),
        el("td", null, fmt.pct(lower))
      );
      return tr;
    })
  );

  const total = el("tr");
  const th = el("th", null, t("methodTotal"));
  th.scope = "row";
  th.colSpan = 3;
  total.append(th, el("td", null, fmt.pct(m.score)));
  tfoot.replaceChildren(total);

  $("method-seats").textContent = t("methodSeats", SEATS, fmt.pct(1 / SEATS));
}

function renderFooter(m) {
  const link = $("source-population");
  link.textContent = t("sourcePopulation", m.population.table);
  link.href = m.population.url;
  $("data-generated").textContent = t("dataGenerated", fmt.date(m.generated));
}

// Tooltip ------------------------------------------------------------------------

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

// Start --------------------------------------------------------------------------

async function main() {
  renderStaticText();
  try {
    const data = await loadData();
    const model = computeModel(data, todayIso());
    renderScore(model);
    renderCouncil(model);
    renderPopulation(model);
    renderComparison(model);
    renderMethod(model);
    renderFooter(model);
    setupTooltip();
  } catch (err) {
    console.error(err);
    const box = $("load-error");
    box.textContent = t("loadError");
    box.hidden = false;
  }
}

main();
