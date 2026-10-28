/**
 * comparisons.js — the four comparisons between the Federal Council and
 * the population: gender, party, language and age.
 *
 * Each comparison describes
 *   - categories(members, day): its categories, in display order
 *   - label(c), color(c):       how a category is named and drawn
 *   - categoryOf(member, day):  which category a Council member falls into
 *   - population(day, cats):    the BFS figures that apply on that day,
 *                               or null if the BFS has no data for that time;
 *                               optionally `breakdown`: what a grouped
 *                               category contains (shown on hover only)
 * The score is the same overlap coefficient for all of them (metrics.js).
 * No DOM code here.
 *
 * Dates are ISO strings ("2025-03-12"), which compare correctly as text.
 */

import { t } from "./i18n.js";

// --- Helpers ---------------------------------------------------------------------

/**
 * The year to use from a table with one entry per year ({"1860": …}): the
 * latest year up to `year`; before the first year, the first year.
 */
export function pickYear(years, year) {
  const available = Object.keys(years).map(Number).sort((a, b) => a - b);
  const upTo = available.filter((y) => y <= year);
  return upTo.length ? upTo[upTo.length - 1] : available[0];
}

/** Age in completed years on a given day: ("1960-02-17", "2025-04-01") -> 65. */
export function ageOn(birthDate, day) {
  const age = Number(day.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return day.slice(5) < birthDate.slice(5) ? age - 1 : age;
}

/** The member's party on a given day (some changed party, e.g. SVP -> BDP). */
export function partyOn(member, day) {
  let party = member.parties[0].party;
  for (const p of member.parties) if (!p.from || p.from <= day) party = p.party;
  return party;
}

// Colours come from one palette (CSS custom properties in style.css). Within
// each bar, the order of the colours was checked for colour-blind separation.
const COLOR = (name) => `var(--${name})`;

// --- The four comparisons ----------------------------------------------------------

export function buildComparisons(data) {
  // Parties always shown, from left to right; any other party with a seat
  // is added, all remaining parties are grouped as "Übrige" (they have no
  // seat, so grouping them does not change the score). Colours follow the
  // usual party colours where the palette allows (Mitte: amber, since its
  // orange would be too close to SP's red).
  const MAIN_PARTIES = ["SP", "Mitte", "FDP", "SVP"];
  const OTHER = "Übrige";
  const partyColors = {
    SP: COLOR("red"),
    Mitte: COLOR("amber"),
    FDP: COLOR("blue"),
    SVP: COLOR("green"),
    [OTHER]: COLOR("other"),
  };

  // National Council elections are held in October: an election counts
  // for Councils that took office from 1 November of that year.
  const electionOn = (day) => {
    const held = Object.keys(data.party.elections).filter((y) => `${y}-11-01` <= day);
    return held.length ? held[held.length - 1] : null;
  };

  const ageGroups = data.age.groups;
  const ageGroupOf = (age) =>
    ageGroups.find((g) => age >= g.min && (g.max === null || age <= g.max))?.key;

  return [
    {
      key: "gender",
      title: t("compareGender"),
      categories: () => ["female", "male"],
      label: (c) => t(c),
      color: (c) => `var(--${c})`,
      categoryOf: (m) => m.gender,
      population(day) {
        const year = pickYear(data.gender.years, Number(day.slice(0, 4)));
        const values = data.gender.years[year];
        return { label: t("populationYear", year), values, persons: values };
      },
    },
    {
      key: "party",
      title: t("compareParty"),
      categories(members, day) {
        const extra = [...new Set(members.map((m) => partyOn(m, day)))].filter(
          (p) => !MAIN_PARTIES.includes(p)
        );
        return [...MAIN_PARTIES, ...extra, OTHER];
      },
      label: (c) => (c === "Mitte" ? t("partyMitte") : c === OTHER ? t("partyOther") : c),
      color: (c) => partyColors[c] ?? COLOR("violet"), // e.g. BDP (2008–2015)
      categoryOf: (m, day) => partyOn(m, day),
      population(day, categories) {
        const year = electionOn(day);
        if (!year) return null;
        const values = {};
        const others = []; // the parties grouped as "Übrige", for the hover
        for (const [party, share] of Object.entries(data.party.elections[year])) {
          const key = categories.includes(party) ? party : OTHER;
          values[key] = (values[key] ?? 0) + share;
          if (key === OTHER) {
            others.push({ label: party === OTHER ? t("partyFurther") : party, weight: share });
          }
        }
        return { label: t("partyElection", year), values, breakdown: { [OTHER]: others } };
      },
      noData: () => t("noDataParty", Object.keys(data.party.elections)[0]),
    },
    {
      key: "language",
      title: t("compareLanguage"),
      categories: () => ["de", "fr", "it", "rm", "other"],
      label: (c) => t(`language_${c}`),
      color: (c) =>
        COLOR({ de: "blue", fr: "orange", it: "aqua", rm: "amber", other: "other" }[c]),
      categoryOf: (m) => m.language,
      population(day) {
        // Since 2010 people can name several main languages (shares add up
        // to more than 100 %); the score uses the relative shares.
        const year = pickYear(data.language.years, Number(day.slice(0, 4)));
        // Which languages make up "Andere Sprachen" (BFS detail table, since
        // 2010, people aged 15+), for the hover
        const detail = data.language.other.years[year];
        const breakdown = detail && {
          other: Object.entries(detail).map(([name, people]) => ({
            label: name === "Andere Sprachen" ? t("languageFurther") : name,
            weight: people,
          })),
        };
        return {
          label: t("populationYear", year),
          values: data.language.years[year],
          breakdown,
          breakdownNote: detail && t("languageBreakdownNote"),
        };
      },
    },
    {
      key: "age",
      title: t("compareAge"),
      categories: () => ageGroups.map((g) => g.key),
      label: (c) => {
        const g = ageGroups.find((x) => x.key === c);
        return g.max === null ? t("ageFrom", g.min) : t("ageRange", g.min, g.max);
      },
      // Ordered groups: one hue, light (young) to dark (old)
      color: (c) =>
        COLOR(["blue-light", "blue-mid", "blue-dark"][ageGroups.findIndex((g) => g.key === c)]),
      categoryOf: (m, day) => ageGroupOf(ageOn(m.birthDate, day)),
      population(day) {
        const year = pickYear(data.age.years, Number(day.slice(0, 4)));
        const values = data.age.years[year];
        return { label: t("populationAdults", year, ageGroups[0].min), values, persons: values };
      },
    },
  ];
}
