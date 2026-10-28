/**
 * council.js — turns the list of councillors into every version of the
 * Federal Council. Pure data logic, no DOM code.
 *
 * Dates are ISO strings ("2025-03-12"), which compare correctly as text.
 */

export const SEATS = 7; // constitutional size of the Federal Council (Art. 175 BV)

/** "2025-03-31" + 1 -> "2025-04-01" (calculated in UTC to avoid DST issues). */
export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Order by seniority: earliest election first (ties: lower number). */
export const bySeniority = (a, b) =>
  a.electionDate.localeCompare(b.electionDate) || a.number - b.number;

/**
 * Who sits in the Council on a given day.
 *
 * The CSV has the day someone was *elected*, not the day they took office.
 * Successors are usually elected a few weeks before their predecessor
 * leaves, so on some days more than 7 people are "in office" by date.
 * Rule: a newly elected member only takes a seat once one is free, i.e. if
 * there are more than 7, the 7 most senior are in office.
 */
export function inOfficeOn(councillors, day) {
  return councillors
    .filter(
      (c) =>
        c.electionDate &&
        c.electionDate <= day &&
        (!c.leftOfficeDate || c.leftOfficeDate >= day)
    )
    .sort(bySeniority)
    .slice(0, SEATS);
}

/**
 * Every version of the Council since 1848, oldest first: a new version
 * starts whenever the membership changes.
 *
 *   [{ start, end, members }, …]   (end = null if still in office;
 *                                   members ordered by seniority)
 *
 * The membership can only change on an election day or on the day after
 * someone left, so it is enough to look at those days. Short gaps with an
 * empty seat (between a departure and the successor taking office) are
 * not counted as versions of their own.
 */
export function buildVersions(councillors) {
  const changeDays = new Set();
  for (const c of councillors) {
    if (c.electionDate) changeDays.add(c.electionDate);
    if (c.leftOfficeDate) changeDays.add(addDays(c.leftOfficeDate, 1));
  }

  const periods = [];
  for (const day of [...changeDays].sort()) {
    const members = inOfficeOn(councillors, day); // already by seniority
    const key = members.map((m) => m.number).sort((a, b) => a - b).join(",");
    const last = periods[periods.length - 1];
    if (last && last.key === key) continue; // nobody changed
    if (last) last.end = addDays(day, -1);
    periods.push({ key, start: day, end: null, members });
  }

  return periods
    .filter((p) => p.members.length === SEATS)
    .map(({ start, end, members }) => ({ start, end, members }));
}

/**
 * Scenario: replace departing members by successors of a chosen gender.
 *
 * `choices` maps a member's number to "today" (no change), "female" or
 * "male", e.g. { 116: "female" }. Returns a new list; the input is unchanged.
 */
export function withSuccessors(members, choices) {
  return members.map((m) => {
    const choice = choices[m.number];
    return choice && choice !== "today" ? { ...m, gender: choice, successor: true } : m;
  });
}
