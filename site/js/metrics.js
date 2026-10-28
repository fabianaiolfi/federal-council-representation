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
