/**
 * comparisons.js — the four comparisons between the Federal Council and
 * the population: gender, party, language and age.
 *
 * Each comparison describes
 *   - categories(members, day): its categories, in display order
 *   - label(c), color(c):       how a category is named and drawn
 *   - council(members, day):    how many members fall into each category
 *   - population(day, cats):    the BFS figures that apply on that day,
 *                               or null if the BFS has no data for that time
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

/** Count members per category: (members, m => m.gender) -> { female: 2, male: 5 }. */
function countBy(members, keyOf) {
  const counts = {};
  for (const m of members) counts[keyOf(m)] = (counts[keyOf(m)] ?? 0) + 1;
  return counts;
}

// Neutral greys for categories (orange and blue are reserved for gender).
const GREY = (n) => `var(--grey-${n})`;

// --- The four comparisons ----------------------------------------------------------

export function buildComparisons(data) {
  // Parties always shown; any other party with a seat is added, all
  // remaining parties are grouped as "Übrige" (they have no seat, so
  // grouping them does not change the score).
  const MAIN_PARTIES = ["FDP", "Mitte", "SP", "SVP"];
  const OTHER = "Übrige";
  const partyColors = { FDP: GREY(1), Mitte: GREY(2), SP: GREY(3), SVP: GREY(4), [OTHER]: GREY(6) };

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
      council: (members) => countBy(members, (m) => m.gender),
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
      color: (c) => partyColors[c] ?? GREY(5),
      council: (members, day) => countBy(members, (m) => partyOn(m, day)),
      population(day, categories) {
        const year = electionOn(day);
        if (!year) return null;
        const values = {};
        for (const [party, share] of Object.entries(data.party.elections[year])) {
          const key = categories.includes(party) ? party : OTHER;
          values[key] = (values[key] ?? 0) + share;
        }
        return { label: t("partyElection", year), values };
      },
      noData: () => t("noDataParty", Object.keys(data.party.elections)[0]),
    },
    {
      key: "language",
      title: t("compareLanguage"),
      categories: () => ["de", "fr", "it", "rm", "other"],
      label: (c) => t(`language_${c}`),
      color: (c) => ({ de: GREY(1), fr: GREY(2), it: GREY(3), rm: GREY(4), other: GREY(6) })[c],
      council: (members) => countBy(members, (m) => m.language),
      population(day) {
        // Since 2010 people can name several main languages (shares add up
        // to more than 100 %); the score uses the relative shares.
        const year = pickYear(data.language.years, Number(day.slice(0, 4)));
        return { label: t("populationYear", year), values: data.language.years[year] };
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
      // Ordered groups: light (young) to dark (old)
      color: (c) => GREY([5, 3, 1][ageGroups.findIndex((g) => g.key === c)] ?? 4),
      council: (members, day) => countBy(members, (m) => ageGroupOf(ageOn(m.birthDate, day))),
      population(day) {
        const year = pickYear(data.age.years, Number(day.slice(0, 4)));
        const values = data.age.years[year];
        return { label: t("populationAdults", year), values, persons: values };
      },
    },
  ];
}
