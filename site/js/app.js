/**
 * app.js — loads data/data.json, does the calculations and fills the page
 * (index.html). All text comes from i18n.js.
 *
 * Pattern (no framework needed at this size):
 *   - `base`  : everything that never changes, computed once from the data
 *               (every version of the Council since 1848 with the result
 *               of each comparison, see comparisons.js)
 *   - `state` : what the user picked — which version is shown, and the
 *               successor gender per departing member (scenario)
 *   - setup*(): build the page once
 *   - update(): show the version/scenario described by `state`.
 *               Called on start and on every change of `state`.
 */

import { t, fmt, getLanguage } from "./i18n.js";
import { overlap, toShares } from "./metrics.js";
import { buildVersions, withSuccessors } from "./council.js";
import { buildComparisons } from "./comparisons.js";

const state = {
  index: 0, // which version is shown (0 = 1848)
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

/** Pick the values of the given categories: ({a: 1, b: 2, c: 3}, ["a", "c"]) -> {a: 1, c: 3}. */
function only(values, categories) {
  return Object.fromEntries(categories.map((c) => [c, values[c] ?? 0]));
}

/**
 * One comparison for one set of members on one day: categories, Council
 * counts and shares (p), population shares (q) and the overlap score.
 * `available: false` if the BFS has no data for that time.
 */
function evaluate(cmp, members, day) {
  const categories = cmp.categories(members, day);
  const pop = cmp.population(day, categories);
  if (!pop) return { key: cmp.key, available: false };
  const counts = only(cmp.council(members, day), categories);
  const p = toShares(counts);
  const q = toShares(only(pop.values, categories));
  return { key: cmp.key, available: true, categories, counts, p, q, pop, score: overlap(p, q) };
}

/** Overall score: the average of all comparisons that have data. */
function average(results) {
  const scores = results.filter((r) => r.available).map((r) => r.score);
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}

/**
 * The fixed part: every version of the Council since 1848 (up to today),
 * each with the result of every comparison and their average.
 *
 * Each version is measured on one day (`day`): past versions on the day
 * they took office, the Council in office as of today (so ages are today's
 * ages and the latest population figures apply).
 */
function computeBase(data, today) {
  const comparisons = buildComparisons(data);
  const isInOffice = (c) => c.start <= today && (!c.end || c.end >= today);
  const versions = buildVersions(data.councillors)
    .filter((c) => c.start <= today)
    .map((c) => {
      const day = isInOffice(c) ? today : c.start;
      const results = comparisons.map((cmp) => evaluate(cmp, c.members, day));
      return { ...c, day, results, overall: average(results) };
    });

  // The version in office today (-1 if today has an empty seat,
  // e.g. a successor is missing in the CSV).
  const currentIndex = versions.findIndex(isInOffice);
  const current = versions[currentIndex];

  return {
    today,
    comparisons,
    versions,
    currentIndex,
    // Current members with a known leaving date: these seats can be
    // "re-filled" in the scenario picker.
    departures: current ? current.members.filter((m) => m.leftOfficeDate) : [],
    councillors: data.councillors, // for the picture credits
    sources: [data.gender, data.language, data.language.other, data.party],
    generated: data.generated,
  };
}

/** Everything that is shown for the current `state`. */
function computeView() {
  const i = state.index;
  const c = base.versions[i];
  const isCurrent = i === base.currentIndex;
  const isScenario = isCurrent && Object.values(state.choices).some((x) => x !== "today");

  // Scenario: only the successor's gender is chosen, so only the gender
  // comparison is recalculated (same population year, successors swapped in).
  const results = isScenario
    ? c.results.map((r) =>
        r.key === "gender"
          ? evaluate(base.comparisons[0], withSuccessors(c.members, state.choices), c.day)
          : r
      )
    : c.results;

  // In a scenario, the change versus today is shown under the overall
  // score and under the gender score (the only one the scenario changes).
  return {
    version: c,
    isCurrent,
    isScenario,
    overall: average(results),
    overallDelta: isScenario ? average(results) - c.overall : null,
    results: results.map((r, k) => ({
      ...r,
      delta: isScenario && r.key === "gender" ? r.score - c.results[k].score : null,
    })),
  };
}

/** Short label for a version's time in office: "2019 – 2022", "2025 – heute". */
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

/**
 * Navigation in the panel head: previous/next buttons, the slider, and the
 * ← → keys anywhere on the page. All of them just change state.index.
 */
function setupNavigator() {
  const panel = $("council-panel");
  const head = $("panel-head");
  const range = $("nav-range");
  const last = base.versions.length - 1;
  head.setAttribute("role", "region");
  head.setAttribute("aria-label", t("navLabel"));
  $("nav-prev").setAttribute("aria-label", t("navPrev"));
  $("nav-next").setAttribute("aria-label", t("navNext"));
  range.setAttribute("aria-label", t("navSlider"));
  range.max = last;

  const go = (index) => {
    const next = Math.min(Math.max(index, 0), last);
    if (next === state.index) return;
    state.index = next;
    update();
  };
  $("nav-prev").addEventListener("click", () => go(state.index - 1));
  $("nav-next").addEventListener("click", () => go(state.index + 1));
  range.addEventListener("input", () => go(Number(range.value)));

  // Arrow keys step through the versions, unless the focus is in a form
  // control that uses the arrow keys itself (slider, radio buttons).
  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest("input, select, textarea, [contenteditable]")) return;
    if (e.key === "ArrowLeft") go(state.index - 1);
    else if (e.key === "ArrowRight") go(state.index + 1);
    else return;
    e.preventDefault();
  });

  setupTicks(last);
  head.hidden = false;
  panel.hidden = false;

  // Show the score in the panel head only while the big number is off
  // screen. The negative top margin excludes the area covered by the head
  // when it sticks to the top.
  new IntersectionObserver(
    ([entry]) => head.classList.toggle("show-score", !entry.isIntersecting),
    { rootMargin: `-${head.offsetHeight}px 0px 0px 0px` }
  ).observe($("score-value"));
}

/**
 * Year labels under the slider. The slider moves in versions, not years,
 * so each label sits at the version that was in office on 1 January.
 */
function setupTicks(last) {
  const indexInOffice = (year) => {
    const day = `${year}-01-01`;
    let found = 0;
    base.versions.forEach((v, i) => {
      if (v.start <= day) found = i;
    });
    return found;
  };
  const ticks = [
    { label: base.versions[0].start.slice(0, 4), index: 0, edge: "start" },
    ...[1900, 1950, 2000].map((y) => ({ label: String(y), index: indexInOffice(y) })),
  ];
  $("nav-ticks").replaceChildren(
    ...ticks.map((tick) => {
      const span = el("span", tick.edge ? `tick tick-${tick.edge}` : "tick", tick.label);
      // The CSS turns --at (0..1) into a position that follows the thumb.
      span.style.setProperty("--at", tick.index / last);
      return span;
    })
  );
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
    fieldset.append(segmented, el("p", "scenario-hint", t("scenarioScope")));
    return fieldset;
  });
  $("scenarios").replaceChildren(...groups);
}

/**
 * One section per comparison: title and score, change, note (no data),
 * legend and two aligned 100 % bars (Council vs population). Built once;
 * update() fills them in.
 */
function setupComparisons() {
  const sections = base.comparisons.map((cmp) => {
    const section = el("section", "comparison");
    section.dataset.key = cmp.key;

    const head = el("div", "comparison-head");
    head.append(el("h3", null, cmp.title), el("p", "comparison-score"));
    const bars = el("div", "bars");
    bars.append(barRow("council"), barRow("population"));
    section.append(
      head,
      el("p", "comparison-delta"),
      el("p", "comparison-note"),
      el("ul", "legend"),
      bars
    );
    return section;
  });
  $("comparisons").replaceChildren(...sections);
}

/** An empty bar row: name and values above, the bar below. */
function barRow(key) {
  const row = el("div", "bar-row");
  row.dataset.row = key;
  const head = el("div", "bar-head");
  head.append(el("span", "bar-name"), el("span", "bar-values"));
  row.append(head, el("div", "bar"));
  return row;
}

function setupFooter() {
  // One line per BFS table, linking to the table
  const items = base.sources.map((source) => {
    const li = el("li");
    const link = el("a", null, t("sourceBfs", source.tableTitle, source.table));
    link.href = source.url;
    link.rel = "noopener";
    li.append(link);
    return li;
  });
  $("sources-bfs").replaceWith(...items);
  $("data-generated").textContent = t("dataGenerated", fmt.date(base.generated));
  setupCredits();
}

/**
 * Picture credits: author and licence of every portrait (required by
 * several of the licences), in a collapsed list in the footer.
 */
function setupCredits() {
  const people = base.councillors.filter((c) => c.portrait);
  const items = people.map((c) => {
    const p = c.portrait;
    const li = el("li");
    const file = el("a", null, c.name);
    file.href = p.source;
    file.rel = "noopener";
    li.append(file, document.createTextNode(`: ${p.author || t("creditAuthorUnknown")}, `));
    if (p.licenseUrl) {
      const license = el("a", null, p.license);
      license.href = p.licenseUrl;
      license.rel = "noopener";
      li.append(license);
    } else {
      li.append(document.createTextNode(p.license || "–"));
    }
    return li;
  });
  $("credits-list").replaceChildren(...items);
  $("credits").hidden = people.length === 0;
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
    const breakdown = breakdowns.get(seg);
    if (breakdown) {
      const list = el("ul", "tooltip-breakdown");
      for (const item of breakdown.items) {
        const li = el("li");
        li.append(el("span", null, item.label), el("span", null, fmt.pct(item.share)));
        list.append(li);
      }
      tip.append(list);
      if (breakdown.note) tip.append(el("span", "tooltip-detail", breakdown.note));
    }
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

  const bars = $("comparisons");
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
  const label = periodLabel(v.version, v.isCurrent);
  $("nav-period").textContent = label;
  const range = $("nav-range");
  range.value = state.index;
  range.setAttribute("aria-valuetext", label);
  $("nav-prev").disabled = state.index === 0;
  $("nav-next").disabled = state.index === base.versions.length - 1;
}

/** Coloured square with initials; used when there is no portrait. */
function initialsAvatar(m) {
  const avatar = el("span", `avatar avatar-${m.gender}`, initials(m.name));
  avatar.setAttribute("aria-hidden", "true");
  return avatar;
}

/** Portrait photo, falling back to the initials if the image can't load. */
function portrait(m) {
  if (!m.portrait) return initialsAvatar(m);
  const img = el("img", "portrait");
  img.src = m.portrait.image;
  img.alt = ""; // decorative: the name is right next to it
  img.decoding = "async";
  img.addEventListener("error", () => img.replaceWith(initialsAvatar(m)));
  return img;
}

/** One card per member: portrait, name, party and canton. */
function memberCard(m) {
  const li = el("li", "member");
  const avatar = portrait(m);

  const body = el("div", "member-body");
  body.append(
    el("p", "member-name", m.name),
    el("p", "member-meta", `${m.party} · ${m.canton}`)
  );

  li.append(avatar, body);
  return li;
}

/** The members of the shown version, by seniority. */
function updateCouncil(v) {
  const c = v.version;
  $("council-subtitle").textContent = v.isCurrent
    ? t("councilSince", fmt.date(c.start))
    : c.start === c.end
      ? t("councilOneDay", fmt.date(c.start))
      : t("councilFromTo", fmt.date(c.start), fmt.date(c.end));

  $("council-list").replaceChildren(...c.members.map(memberCard));

  // Safety net: if today has an empty seat, the CSV may be out of date
  // (e.g. a successor is missing). Shown with the latest version.
  const isLatest = state.index === base.versions.length - 1;
  const warning = $("council-warning");
  warning.hidden = !(isLatest && base.currentIndex === -1);
  warning.textContent = t("councilWarning");
}

/**
 * Fill one bar row: name, values, and one segment per category. Segments
 * are reused when the categories stay the same, so CSS can animate their
 * widths; flex-grow = share, so the 2px gaps never push past 100 %.
 */
function updateBarRow(row, cmp, name, shares, detailFor, breakdownFor = () => null) {
  row.querySelector(".bar-name").textContent = name;
  row.querySelector(".bar-values").textContent = Object.keys(shares)
    .filter((c) => shares[c] > 0)
    .map((c) => `${cmp.label(c)} ${fmt.pct(shares[c])}`)
    .join(" · ");

  const bar = row.querySelector(".bar");
  const keys = Object.keys(shares);
  if ([...bar.children].map((s) => s.dataset.category).join() !== keys.join()) {
    bar.replaceChildren(
      ...keys.map((c) => {
        const seg = el("div", "seg");
        seg.dataset.category = c;
        seg.tabIndex = 0;
        seg.style.background = cmp.color(c);
        return seg;
      })
    );
  }
  for (const seg of bar.children) {
    const c = seg.dataset.category;
    seg.hidden = shares[c] === 0;
    seg.style.flexGrow = shares[c];
    seg.dataset.value = fmt.pct(shares[c]);
    seg.dataset.label = `${cmp.label(c)} · ${name}`;
    seg.dataset.detail = detailFor(c);
    seg.setAttribute("aria-label", `${seg.dataset.label}: ${seg.dataset.value} ${seg.dataset.detail}`);
    breakdowns.set(seg, breakdownFor(c));
  }
}

// What a grouped segment ("Übrige Parteien", "Andere Sprachen") contains,
// shown in its tooltip: segment -> { items: [{label, share}], note } or null
const breakdowns = new WeakMap();

/**
 * Split a grouped category's share among its members, in proportion to
 * their weights (votes, people), largest first. The parts add up exactly
 * to the share shown for the category.
 */
function splitShare(share, items, note) {
  if (!items?.length) return null;
  const total = items.reduce((a, x) => a + x.weight, 0);
  return {
    items: items
      .map((x) => ({ label: x.label, share: (share * x.weight) / total }))
      .sort((a, b) => b.share - a.share),
    note,
  };
}

/** Legend: coloured key + label for each category. */
function updateLegend(list, cmp, categories) {
  list.replaceChildren(
    ...categories.map((c) => {
      const li = el("li");
      const key = el("span", "key");
      key.style.background = cmp.color(c);
      li.append(key, document.createTextNode(cmp.label(c)));
      return li;
    })
  );
}

/** "+14.3 Prozentpunkte gegenüber heute" (empty if there is nothing to compare). */
function deltaText(delta) {
  if (delta === null) return "";
  const pp = delta * 100;
  const direction = Math.abs(pp) < 0.05 ? 0 : Math.sign(pp);
  return t("scoreDelta", fmt.dec(Math.abs(pp)), direction);
}

/**
 * Animate numbers from their current value to a new one (0..1). Each
 * counter keeps its own state, so several numbers can move at once.
 */
function counter(...nodes) {
  let shown = null; // the value currently displayed (mid-animation too)
  let frame = 0;
  const paint = (value) => {
    for (const n of nodes) n.textContent = value === null ? "–" : fmt.pct(value);
  };
  return (to) => {
    cancelAnimationFrame(frame);
    const from = shown;
    if (from === null || to === null || from === to || prefersReducedMotion()) {
      shown = to;
      paint(to);
      return;
    }
    const duration = 450; // ms
    let start = null;
    const step = (now) => {
      // Measure time with the frame timestamps only (the first frame is the
      // start); mixing them with performance.now() can give negative progress.
      start ??= now;
      const k = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3); // ease-out
      shown = from + (to - from) * eased;
      paint(shown);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };
}
const counters = {}; // created on first use: "overall", "gender", …

function updateComparisons(v) {
  // Scenario picker only makes sense for the Council in office today.
  $("scenarios").hidden = !v.isCurrent;

  // Overall score (the line under it stays in the layout when empty, so
  // nothing below jumps)
  counters.overall ??= counter($("score-value"), $("nav-score"));
  counters.overall(v.overall);
  $("score-delta").textContent = deltaText(v.overallDelta);
  const included = v.results.filter((r) => r.available).map((r) =>
    base.comparisons.find((c) => c.key === r.key).title
  );
  $("score-caption").textContent = t("overallCaption", included);

  // One section per comparison
  const councilName = v.isScenario
    ? t("compareCouncilScenario")
    : t("compareCouncil", periodLabel(v.version, v.isCurrent));
  for (const [k, r] of v.results.entries()) {
    const cmp = base.comparisons[k];
    const section = document.querySelector(`.comparison[data-key="${cmp.key}"]`);
    counters[cmp.key] ??= counter(section.querySelector(".comparison-score"));
    counters[cmp.key](r.available ? r.score : null);
    section.querySelector(".comparison-delta").textContent = deltaText(r.delta);
    section.querySelector(".comparison-note").textContent = r.available ? "" : cmp.noData();
    section.classList.toggle("is-unavailable", !r.available);
    if (!r.available) continue;

    updateLegend(section.querySelector(".legend"), cmp, r.categories);
    const seats = Object.values(r.counts).reduce((a, b) => a + b, 0);
    const [councilRow, populationRow] = section.querySelectorAll(".bar-row");
    updateBarRow(councilRow, cmp, councilName, only(r.p, r.categories), (c) =>
      t("tooltipOf", r.counts[c], seats)
    );
    updateBarRow(
      populationRow,
      cmp,
      r.pop.label,
      only(r.q, r.categories),
      (c) => (r.pop.persons ? t("tooltipPersons", fmt.int(r.pop.persons[c])) : ""),
      (c) => splitShare(r.q[c], r.pop.breakdown?.[c], r.pop.breakdownNote)
    );
  }

  // Screen readers: announce the final result once (not every animation frame)
  $("score-status").textContent = [
    `${t("overallLabel")}: ${v.overall === null ? "–" : fmt.pct(v.overall)}`,
    $("score-delta").textContent,
  ]
    .filter(Boolean)
    .join(", ");
}

function update() {
  const v = computeView();
  updateNavigator(v);
  updateCouncil(v);
  updateComparisons(v);
}

// Start --------------------------------------------------------------------------

/** Show an error box instead of the content. */
function showError(key, err) {
  console.error(err);
  const box = $("load-error");
  box.textContent = t(key);
  box.hidden = false;
}

async function main() {
  setupStaticText();

  let data;
  try {
    data = await loadData();
  } catch (err) {
    return showError("loadError", err); // e.g. opened via file:// or no server
  }

  try {
    base = computeBase(data, todayIso());
    // Start with today's Council (or the latest one if today has a gap).
    state.index = base.currentIndex >= 0 ? base.currentIndex : base.versions.length - 1;
    setupNavigator();
    setupScenarios();
    setupComparisons();
    setupFooter();
    setupTooltip();
    update();
  } catch (err) {
    return showError("renderError", err); // e.g. old cached files mixed with new ones
  }
}

main();
