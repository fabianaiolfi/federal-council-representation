/**
 * metrics.js — the calculations behind the app, kept free of any DOM code
 * so they are easy to read, test and reuse for other dimensions later
 * (language region, canton, party, age …).
 *
 * A "distribution" is an object mapping category -> share (0..1), e.g.
 *   { female: 0.2857, male: 0.7143 }
 */

/**
 * Overlap coefficient between two distributions p and q:
 *
 *   score = Σ min(pᵢ, qᵢ)
 *
 * 1 (100 %) means identical composition, 0 means no overlap at all.
 * It equals 1 − ½·Σ|pᵢ − qᵢ|, i.e. 1 minus the total variation distance
 * (known in political science as the Loosemore–Hanby index of
 * disproportionality).
 */
export function overlap(p, q) {
  const categories = new Set([...Object.keys(p), ...Object.keys(q)]);
  let score = 0;
  for (const c of categories) {
    score += Math.min(p[c] ?? 0, q[c] ?? 0);
  }
  return score;
}

/** Turn counts { female: 2, male: 5 } into shares { female: 0.2857, … }. */
export function toShares(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const shares = {};
  for (const [c, n] of Object.entries(counts)) shares[c] = total ? n / total : 0;
  return shares;
}

/**
 * Best score a body with `seats` seats can reach against population shares q
 * (two categories only: `focus` and `other`).
 *
 * With 7 seats the Council's shares move in steps of 1/7 ≈ 14.3 %, so it can
 * never match a 50.3 / 49.7 population exactly. Trying every possible split
 * gives the realistic ceiling against which the actual score can be read.
 *
 * Returns { score, focusSeats } for the best split.
 */
export function bestPossible(q, seats, focus, other) {
  let best = { score: -1, focusSeats: 0 };
  for (let k = 0; k <= seats; k++) {
    const p = { [focus]: k / seats, [other]: (seats - k) / seats };
    const score = overlap(p, q);
    if (score > best.score) best = { score, focusSeats: k };
  }
  return best;
}

/**
 * Members in office on a given day: elected on or before that day and not yet
 * left (no leaving date, or leaving date later than the day).
 * Dates are ISO strings ("2025-03-12"), which compare correctly as text.
 */
export function inOfficeOn(councillors, isoDay) {
  return councillors.filter(
    (c) =>
      c.electionDate &&
      c.electionDate <= isoDay &&
      (!c.leftOfficeDate || c.leftOfficeDate >= isoDay)
  );
}
