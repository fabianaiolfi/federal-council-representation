/**
 * app.js — loads data/data.json, does the calculations and fills the page
 * (index.html). All text comes from i18n.js.
 *
 * Pattern (no framework needed at this size):
 *   - `base`  : everything that never changes, computed once from the data
 *               (every version of the Council since 1848 with the result
 *               of each comparison, see comparisons.js)
 *   - `state` : what the user picked — which version is shown, and which
 *               members they replaced with a person of their own
 *   - setup*(): build the page once
 *   - update(): show the version described by `state`.
 *               Called on start and on every change of `state`.
 */

import { t, fmt, getLanguage } from "./i18n.js";
import { overlap, toShares } from "./metrics.js";
import { buildVersions } from "./council.js";
import { buildComparisons, ageOn, partyOn } from "./comparisons.js";

const state = {
  index: 0, // which version is shown (0 = 1848)
  // Members replaced by the user, per version:
  //   { [version index]: { [member number]: choice } }
  // choice = { mode, gender, party, language, age, name?, personId?, variant? }
  //   mode: "custom" (put together by the user), "list" (a person from
  //   data/candidates.csv) or "best" (a profile that maximises the score)
  replacements: {},
  editing: null, // number of the member whose replacement is being edited
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

/** "Ludwig von Moos" -> "von Moos", "Karin Keller-Sutter" -> "Keller-Sutter". */
function lastName(name) {
  const parts = name.split(/\s+/);
  const last = parts.length - 1;
  // keep a lowercase particle ("von", "de") that belongs to the last name
  return last > 0 && /^[a-zäöü]/.test(parts[last - 1])
    ? `${parts[last - 1]} ${parts[last]}`
    : parts[last];
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
 * One comparison for one set of members on one day: categories, the
 * members in each category, Council shares (p), population shares (q) and
 * the overlap score. `available: false` if the BFS has no data for that time.
 */
function evaluate(cmp, members, day) {
  const categories = cmp.categories(members, day);
  const pop = cmp.population(day, categories);
  if (!pop) return { key: cmp.key, available: false };
  const groups = Object.fromEntries(categories.map((c) => [c, []]));
  for (const m of members) groups[cmp.categoryOf(m, day)].push(m);
  const p = toShares(Object.fromEntries(categories.map((c) => [c, groups[c].length])));
  const q = toShares(only(pop.values, categories));
  return { key: cmp.key, available: true, categories, groups, p, q, pop, score: overlap(p, q) };
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

  return {
    today,
    comparisons,
    versions,
    currentIndex,
    councillors: data.councillors, // for the picture credits
    candidates: data.candidates ?? [], // people for "Aus Liste wählen"
    ageGroups: data.age.groups,
    sources: [data.gender, data.language, data.language.other, data.party],
    generated: data.generated,
  };
}

/**
 * A person created by the user, standing in for member `m`. They keep m's
 * place in the seniority order; their birth date is derived from the chosen
 * age on the day the version is measured.
 */
function newMember(m, choice, day) {
  return {
    ...m,
    isNew: true,
    fromList: Boolean(choice.name), // a named person from the list
    replaces: m,
    name: choice.name ?? t(choice.gender === "female" ? "newFemale" : "newMale"),
    gender: choice.gender,
    language: choice.language,
    parties: choice.party ? [{ party: choice.party, from: null }] : m.parties,
    age: choice.age,
    birthDate: `${String(Number(day.slice(0, 4)) - choice.age).padStart(4, "0")}${day.slice(4)}`,
    portrait: null,
  };
}

/** Everything that is shown for the current `state`. */
function computeView() {
  const c = base.versions[state.index];
  const changes = state.replacements[state.index] ?? {};
  const isModified = Object.keys(changes).length > 0;
  const members = c.members.map((m) => (changes[m.number] ? newMember(m, changes[m.number], c.day) : m));
  const results = isModified
    ? base.comparisons.map((cmp) => evaluate(cmp, members, c.day))
    : c.results;
  return {
    version: c, // the real Council (its results are the reference for changes)
    isCurrent: state.index === base.currentIndex,
    isModified,
    members,
    overall: average(results),
    results,
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
    closeEditor({ refocus: false });
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
 * "Was bedeutet das?" next to the overall score: an explanation that opens
 * on hover or keyboard focus, and stays open after a click or tap (until
 * clicked again, Escape, or a click elsewhere).
 */
function setupInfo() {
  const head = document.querySelector(".score-head");
  const button = $("info-button");
  const box = $("info-box");
  // Icon-only button: its name comes from the label (and a tooltip on hover)
  button.setAttribute("aria-label", t("infoButton"));
  button.title = t("infoButton");

  const example = el("div", "info-example");
  example.id = "info-example";
  box.replaceChildren(
    el("p", "info-title", t("infoButton")),
    el("p", null, t("infoWhat")),
    example, // filled in by updateComparisons()
    el("p", null, t("infoOverall")),
    el("p", "info-method", t("infoMethod"))
  );

  let pinned = false;
  const show = (open) => {
    box.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  };
  const close = () => {
    pinned = false;
    show(false);
  };

  button.addEventListener("click", () => {
    pinned = !pinned;
    show(pinned);
  });
  head.addEventListener("mouseenter", () => show(true));
  head.addEventListener("mouseleave", () => pinned || show(false));
  button.addEventListener("focus", () => show(true));
  head.addEventListener("focusout", (e) => {
    if (!pinned && !head.contains(e.relatedTarget)) show(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !box.hidden) {
      close();
      button.focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (!box.hidden && !head.contains(e.target)) close();
  });
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
    if (breakdown?.names) {
      // Council bar: the members of this group, in one line
      tip.append(el("span", "tooltip-names", breakdown.names.join(" · ")));
    } else if (breakdown) {
      // Grouped population share: one line per part, with its share
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

/** A small text button that triggers an action on a member's card. */
function cardButton(action, number, text) {
  const button = el("button", "link-button", text);
  button.type = "button";
  button.dataset.action = action;
  button.dataset.number = number;
  return button;
}

/**
 * One card per member: portrait, name, "party · language", and a button to
 * replace them. A person created by the user shows their chosen profile.
 */
function memberCard(m) {
  const li = el("li", m.isNew ? "member is-new" : "member");
  const body = el("div", "member-body");
  const actions = el("p", "member-actions");
  const language = base.comparisons.find((c) => c.key === "language");

  if (m.isNew) {
    const avatar = m.fromList
      ? initialsAvatar(m)
      : el("span", `avatar avatar-${m.gender} avatar-new`, t("newShort"));
    avatar.setAttribute("aria-hidden", "true");
    const party = base.comparisons.find((c) => c.key === "party");
    body.append(
      el("p", "member-name", m.name),
      el("p", "member-meta", `${party.choiceLabel(m.parties[0].party)} · ${language.choiceLabel(m.language)}`),
      el("p", "member-meta", t("insteadOf", m.replaces.name))
    );
    actions.append(
      cardButton("edit", m.number, t("editButton")),
      cardButton("undo", m.number, t("undoButton"))
    );
    li.append(avatar, body);
  } else {
    body.append(
      el("p", "member-name", m.name),
      el("p", "member-meta", `${m.party} · ${language.choiceLabel(m.language)}`)
    );
    actions.append(cardButton("replace", m.number, t("replaceButton")));
    li.append(portrait(m), body);
  }
  body.append(actions);
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

  $("council-list").replaceChildren(...v.members.map(memberCard));

  // Below the cards: an invitation to try it, or what has been changed
  const foot = $("panel-foot");
  const replaced = v.members.filter((m) => m.isNew).length;
  if (replaced) {
    const reset = el("button", "link-button", t("resetAll"));
    reset.type = "button";
    reset.dataset.action = "reset";
    foot.replaceChildren(el("span", null, t("replacedCount", replaced)), reset);
  } else {
    foot.replaceChildren(el("span", null, t("replaceHint")));
  }

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

// Shown in a segment's tooltip: the Council members of that group
// ({ names }), or what a grouped population share contains
// ({ items: [{label, share}], note }); null for nothing
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
  // Overall score
  counters.overall ??= counter($("score-value"), $("nav-score"));
  counters.overall(v.overall);
  const included = v.results.filter((r) => r.available).map((r) =>
    base.comparisons.find((c) => c.key === r.key).title
  );
  $("score-caption").textContent = t("overallCaption", included);

  // Worked example in "Was bedeutet das?": gender of the Council shown
  const period = periodLabel(v.version, v.isCurrent);
  const gender = v.results.find((r) => r.key === "gender");
  const genderCmp = base.comparisons.find((c) => c.key === "gender");
  const example = el("ul", "info-rows");
  for (const c of gender.categories) {
    example.append(
      el("li", null, t(
        "infoExampleRow",
        genderCmp.label(c),
        fmt.pct(gender.p[c]),
        fmt.pct(gender.q[c]),
        fmt.pct(Math.min(gender.p[c], gender.q[c]))
      ))
    );
  }
  example.append(el("li", "info-sum", t("infoExampleSum", fmt.pct(gender.score))));
  $("info-example").replaceChildren(
    el("p", null, t("infoExampleTitle", t(v.isModified ? "compareCouncilModified" : "compareCouncil", period), gender.pop.label)),
    example
  );

  // One section per comparison
  const councilName = t(v.isModified ? "compareCouncilModified" : "compareCouncil", period);
  for (const [k, r] of v.results.entries()) {
    const cmp = base.comparisons[k];
    const section = document.querySelector(`.comparison[data-key="${cmp.key}"]`);
    counters[cmp.key] ??= counter(section.querySelector(".comparison-score"));
    counters[cmp.key](r.available ? r.score : null);
    section.querySelector(".comparison-note").textContent = r.available ? "" : cmp.noData();
    section.classList.toggle("is-unavailable", !r.available);
    if (!r.available) continue;

    updateLegend(section.querySelector(".legend"), cmp, r.categories);
    const [councilRow, populationRow] = section.querySelectorAll(".bar-row");
    // Council bar: hovering a part lists the members in it. In the age
    // comparison with their age on the day this version is measured.
    const memberLabel = (m) => {
      const name = m.isNew && !m.fromList ? t("newShort") : lastName(m.name);
      return cmp.key === "age" ? `${name} (${ageOn(m.birthDate, v.version.day)})` : name;
    };
    updateBarRow(
      councilRow,
      cmp,
      councilName,
      only(r.p, r.categories),
      () => "",
      (c) => ({ names: r.groups[c].map(memberLabel) })
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
  $("score-status").textContent = `${t("overallLabel")}: ${v.overall === null ? "–" : fmt.pct(v.overall)}`;
}

// Replacing a member ------------------------------------------------------------

/**
 * Buttons on the cards and below them: replace, edit, undo, reset all.
 * One listener for the whole panel, since the cards are rebuilt often.
 */
function setupReplacements() {
  $("council-panel").addEventListener("click", (e) => {
    const button = e.target.closest("button[data-action]");
    if (!button) return;
    const number = Number(button.dataset.number);
    const changes = (state.replacements[state.index] ??= {});
    switch (button.dataset.action) {
      case "replace":
      case "edit":
        openEditor(number);
        break;
      case "undo":
        delete changes[number];
        if (state.editing === number) closeEditor({ refocus: false });
        update();
        break;
      case "reset":
        state.replacements[state.index] = {};
        closeEditor({ refocus: false });
        update();
        break;
    }
  });
  $("editor").addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeEditor();
  });
}

/**
 * Open the editor for member `number`. The new person starts with the
 * replaced member's profile, so nothing changes until the user picks
 * something different.
 */
function openEditor(number) {
  const c = base.versions[state.index];
  const m = c.members.find((x) => x.number === number);
  const party = base.comparisons.find((x) => x.key === "party");
  const changes = (state.replacements[state.index] ??= {});
  changes[number] ??= {
    mode: "custom",
    gender: m.gender,
    party: party.choices(c.day) ? partyOn(m, c.day) : null,
    language: m.language,
    age: ageOn(m.birthDate, c.day),
  };
  state.editing = number;
  renderEditor();
  update();

  const editor = $("editor");
  editor.hidden = false;
  editor.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  editor.querySelector('.mode-button[aria-pressed="true"]')?.focus({ preventScroll: true });
}

function closeEditor({ refocus = true } = {}) {
  const number = state.editing;
  if (number === null) return;
  state.editing = null;
  $("editor").hidden = true;
  // Back to the card's "Bearbeiten" button (or "Ersetzen" after an undo)
  if (refocus) document.querySelector(`#council-list button[data-number="${number}"]`)?.focus();
}

/** One group of options (gender, party, language) as radio "chips". */
function chipField(cmp, choice, day) {
  const fieldset = el("fieldset", "editor-field");
  fieldset.append(el("legend", null, cmp.title));
  let options = cmp.choices(day);
  if (!options) {
    fieldset.append(el("p", "editor-note", t("editorNoParty")));
    return fieldset;
  }
  // The replaced member's own party may be missing from the list (e.g. a
  // party that no longer runs); offer it anyway.
  if (!options.includes(choice[cmp.key])) options = [choice[cmp.key], ...options];

  const chips = el("div", "chips");
  for (const option of options) {
    const label = el("label", "chip");
    const input = el("input");
    input.type = "radio";
    input.name = `editor-${cmp.key}`;
    input.value = option;
    input.checked = choice[cmp.key] === option;
    input.addEventListener("change", () => {
      choice[cmp.key] = option;
      makeCustom(choice);
      update();
    });
    const text = el("span");
    const key = el("span", "key");
    key.style.background = cmp.color(option);
    text.append(key, document.createTextNode(cmp.choiceLabel(option)));
    label.append(input, text);
    chips.append(label);
  }
  fieldset.append(chips);
  return fieldset;
}

/** Age: a slider from 18 (minimum age for the Federal Council) to 90. */
function ageField(choice) {
  const field = el("div", "editor-field");
  const id = "editor-age";
  const label = el("label", "editor-label", t("compareAge"));
  label.htmlFor = id;
  const value = el("output", "editor-age-value", t("ageYears", choice.age));
  value.htmlFor = id;
  const range = el("input", "range");
  range.type = "range";
  range.id = id;
  range.min = 18;
  range.max = 90;
  range.value = choice.age;
  range.addEventListener("input", () => {
    choice.age = Number(range.value);
    value.textContent = t("ageYears", choice.age);
    makeCustom(choice);
    update();
  });
  const head = el("div", "editor-age-head");
  head.append(label, value);
  field.append(head, range);
  return field;
}

/** The choice being edited (the profile of the new person). */
function currentChoice() {
  return state.replacements[state.index][state.editing];
}

/** Once the user changes a field, the person is their own creation. */
function makeCustom(choice) {
  if (choice.mode === "custom") return;
  choice.mode = "custom";
  delete choice.name;
  delete choice.personId;
  delete choice.variant;
  for (const button of $("editor").querySelectorAll(".mode-button")) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === "custom"));
  }
}

/**
 * The three ways to replace a member. Clicking "Bestmögliche Person" again
 * shows the next of the equally good profiles.
 */
function modeSwitch(choice) {
  const group = el("div", "modes");
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", t("modeLabel"));
  for (const mode of ["custom", "list", "best"]) {
    const button = el("button", "mode-button", t(`mode_${mode}`));
    button.type = "button";
    button.dataset.mode = mode;
    button.setAttribute("aria-pressed", String(choice.mode === mode));
    button.addEventListener("click", () => setMode(mode));
    group.append(button);
  }
  return group;
}

function setMode(mode) {
  const choice = currentChoice();
  if (mode === "best") {
    // First click: the first best profile; every further click: the next one
    applyBest(choice, choice.mode === "best" ? choice.variant + 1 : 0);
  } else if (mode === "custom") {
    makeCustom(choice);
  } else {
    choice.mode = "list"; // the profile stays until a person is picked
  }
  renderEditor();
  update();
  $("editor").querySelector(`.mode-button[data-mode="${mode}"]`)?.focus();
}

/**
 * Every profile for this seat (gender × party × language × age group) that
 * gives the highest overall score, with the other members as they are
 * (including the user's other replacements). Ages: the middle of each group.
 */
function bestProfiles() {
  const c = base.versions[state.index];
  const day = c.day;
  const changes = state.replacements[state.index] ?? {};
  const seat = c.members.find((m) => m.number === state.editing);
  const others = c.members.filter((m) => m !== seat).map((m) =>
    changes[m.number] ? newMember(m, changes[m.number], day) : m
  );

  const byKey = Object.fromEntries(base.comparisons.map((cmp) => [cmp.key, cmp]));
  const ages = base.ageGroups.map((g) => (g.max === null ? g.min + 5 : Math.round((g.min + g.max) / 2)));
  const parties = byKey.party.choices(day) ?? [null]; // before 1919: keep the party

  let best = -Infinity;
  let profiles = [];
  for (const gender of byKey.gender.choices(day))
    for (const party of parties)
      for (const language of byKey.language.choices(day))
        for (const age of ages) {
          const profile = { gender, party, language, age };
          const members = [...others, newMember(seat, profile, day)];
          const score = average(base.comparisons.map((cmp) => evaluate(cmp, members, day)));
          if (score > best + 1e-9) {
            best = score;
            profiles = [profile];
          } else if (Math.abs(score - best) <= 1e-9) {
            profiles.push(profile);
          }
        }
  return profiles;
}

function applyBest(choice, variant) {
  const profiles = bestProfiles();
  const k = variant % profiles.length;
  delete choice.name;
  delete choice.personId;
  Object.assign(choice, profiles[k], { mode: "best", variant: k, variants: profiles.length });
}

/** "Frau · GRÜNE · Andere Sprache · 29 Jahre" */
function profileText(choice) {
  const byKey = Object.fromEntries(base.comparisons.map((cmp) => [cmp.key, cmp]));
  return [
    byKey.gender.choiceLabel(choice.gender),
    choice.party && byKey.party.choiceLabel(choice.party),
    byKey.language.choiceLabel(choice.language),
    t("ageYears", choice.age),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Mode "Selbst zusammenstellen": the four fields. */
function customPanel(choice, day) {
  const fields = el("div", "editor-fields");
  for (const cmp of base.comparisons) {
    fields.append(cmp.key === "age" ? ageField(choice) : chipField(cmp, choice, day));
  }
  return fields;
}

/** Mode "Aus Liste wählen": the people from data/candidates.csv. */
function listPanel(choice, day) {
  const panel = el("div", "editor-fields");
  if (!base.candidates.length) {
    panel.append(el("p", "editor-note", t("listEmpty")));
    return panel;
  }
  // Only people who would have been adults at that time
  const people = base.candidates.filter((p) => ageOn(p.birthDate, day) >= 18);
  if (!people.length) {
    panel.append(el("p", "editor-note", t("listNoneEligible")));
    return panel;
  }
  const party = base.comparisons.find((cmp) => cmp.key === "party");
  const language = base.comparisons.find((cmp) => cmp.key === "language");
  const hasParties = Boolean(party.choices(day));

  const fieldset = el("fieldset", "editor-field");
  fieldset.append(el("legend", "visually-hidden", t("mode_list")));
  const list = el("div", "person-list");
  for (const person of people) {
    const age = ageOn(person.birthDate, day);
    const row = el("label", "person");
    const input = el("input");
    input.type = "radio";
    input.name = "editor-person";
    input.value = person.id;
    input.checked = choice.personId === person.id;
    input.addEventListener("change", () => {
      Object.assign(choice, {
        mode: "list",
        personId: person.id,
        name: person.name,
        gender: person.gender,
        party: hasParties ? person.party : null,
        language: person.language,
        age,
      });
      delete choice.variant;
      update();
    });
    const text = el("span", "person-text");
    text.append(
      el("span", "person-name", person.name),
      el("span", "person-meta", `${party.choiceLabel(person.party)} · ${language.choiceLabel(person.language)}`)
    );
    row.append(input, text);
    list.append(row);
  }
  fieldset.append(list);
  panel.append(fieldset);
  return panel;
}

/** Mode "Bestmögliche Person": the current best profile and its number. */
function bestPanel(choice) {
  const panel = el("div", "editor-fields");
  panel.append(el("p", "editor-note", t("bestIntro")));
  const profile = el("div", "best-profile");
  profile.append(
    el("p", "best-variant", t("bestVariant", choice.variant + 1, choice.variants)),
    el("p", "best-text", profileText(choice))
  );
  panel.append(profile);
  if (choice.variants > 1) {
    const next = el("button", "link-button", t("bestNext"));
    next.type = "button";
    next.addEventListener("click", () => setMode("best"));
    panel.append(next);
  }
  return panel;
}

/** (Re)build the editor for the member being replaced, in the current mode. */
function renderEditor() {
  const c = base.versions[state.index];
  const m = c.members.find((x) => x.number === state.editing);
  const choice = currentChoice();

  const title = el("h3", "editor-title", t("editorTitle", m.name));
  title.id = "editor-title";

  const panel =
    choice.mode === "list" ? listPanel(choice, c.day)
    : choice.mode === "best" ? bestPanel(choice)
    : customPanel(choice, c.day);

  // Live result: overall score and each comparison, versus the real Council
  const result = el("div", "editor-result");
  result.setAttribute("aria-live", "polite");
  const score = el("p", "editor-score");
  score.id = "editor-score";
  const delta = el("p", "editor-delta");
  delta.id = "editor-delta";
  const list = el("ul", "editor-scores");
  list.id = "editor-scores";
  result.append(el("p", "editor-result-label", t("overallLabel")), score, delta, list);

  const done = el("button", "button", t("editorDone"));
  done.type = "button";
  done.addEventListener("click", () => closeEditor());
  const actions = el("div", "editor-actions");
  actions.append(done);

  $("editor").replaceChildren(title, modeSwitch(choice), panel, result, actions);
}

/** "+3.6" / "−2.1" / "±0.0" (percentage points). */
function signedPoints(delta) {
  const pp = delta * 100;
  if (Math.abs(pp) < 0.05) return `±${fmt.dec(0)}`;
  return `${pp > 0 ? "+" : "−"}${fmt.dec(Math.abs(pp))}`;
}

/** Fill the editor's live result. */
function updateEditor(v) {
  if (state.editing === null) return;
  const diff = v.overall - v.version.overall;
  $("editor-score").textContent = fmt.pct(v.overall);
  $("editor-delta").textContent = t("editorDelta", signedPoints(diff), Math.abs(diff) < 0.0005);
  $("editor-scores").replaceChildren(
    ...v.results.map((r, k) => {
      const cmp = base.comparisons[k];
      const before = v.version.results[k];
      const text = r.available
        ? `${cmp.title} ${fmt.pct(r.score)} (${signedPoints(r.score - before.score)})`
        : `${cmp.title} –`;
      return el("li", null, text);
    })
  );
}

function update() {
  const v = computeView();
  updateNavigator(v);
  updateCouncil(v);
  updateComparisons(v);
  updateEditor(v);
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
    setupComparisons();
    setupInfo();
    setupReplacements();
    setupFooter();
    setupTooltip();
    update();
  } catch (err) {
    return showError("renderError", err); // e.g. old cached files mixed with new ones
  }
}

main();
