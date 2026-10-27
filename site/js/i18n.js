/**
 * i18n.js — every piece of text shown in the app lives here.
 *
 * To add a language later (e.g. French), copy the "de-CH" block, translate
 * it as "fr-CH" and add a switcher that calls setLanguage("fr-CH") and
 * re-renders. Nothing else in the code contains user-facing text.
 *
 * Entries are either plain strings or functions (for text with numbers or
 * names in it). Numbers arrive already formatted (see fmt below).
 *
 * Swiss High German: "ss" instead of "ß".
 */

const strings = {
  "de-CH": {
    pageTitle: "Bundesrat und Bevölkerung – Wer ist vertreten?",
    pageDescription:
      "Wie gut bildet der Schweizer Bundesrat die Bevölkerung ab? Ein Vergleich nach Geschlecht.",

    // Header
    eyebrow: "Deskriptive Repräsentation",
    title: "Wie gut bildet der Bundesrat die Bevölkerung ab?",
    lead:
      "Sieben Personen regieren die Schweiz. Diese Seite vergleicht, wie der " +
      "Bundesrat zusammengesetzt ist und wie die Bevölkerung – zuerst nach Geschlecht.",

    // Score
    scoreLabel: "Übereinstimmung nach Geschlecht",
    scoreExplain:
      "100 % hiesse: Der Bundesrat ist gleich zusammengesetzt wie die Bevölkerung.",
    scoreCeiling: (best, women, men, seats) =>
      `Mit ${seats} Sitzen sind höchstens ${best} möglich (${women} Frauen, ${men} Männer).`,
    scoreCeilingTick: (best) => `max. ${best}`,
    scoreMeterLabel: (score, best) =>
      `Übereinstimmung ${score} von 100 %; bestmöglicher Wert ${best}`,
    scoreMethodLink: "Wie wird das berechnet?",

    // Federal Council
    councilTitle: "Der Bundesrat",
    councilSubtitle: (date) => `Stand ${date} · nach Amtsalter geordnet`,
    councilSince: (gender, year) => `${gender} · im Amt seit ${year}`,
    councilSummary: (women, men, share) =>
      `${women} ${women === 1 ? "Frau" : "Frauen"} und ${men} ${men === 1 ? "Mann" : "Männer"} – Frauenanteil ${share}`,
    councilWarning: (n) =>
      `Hinweis: Für heute sind ${n} statt 7 Mitglieder erfasst. Die Daten sind möglicherweise nicht aktuell.`,

    // Population
    populationTitle: "Die Bevölkerung",
    populationSubtitle: (year) => `Ständige Wohnbevölkerung der Schweiz, Ende ${year}`,
    populationPersons: (n) => `${n} Personen`,
    populationTotal: (n) => `Total ${n} Personen`,

    // Comparison
    compareTitle: "Der Vergleich",
    compareSubtitle: "Anteile in Prozent",
    compareCouncil: "Bundesrat",
    comparePopulation: "Bevölkerung",
    compareGap: (pp, direction) =>
      direction === 0
        ? "Frauen sind im Bundesrat genau proportional vertreten."
        : `Frauen sind im Bundesrat um ${pp} Prozentpunkte ${direction < 0 ? "unter" : "über"}vertreten.`,
    compareSeats: (expected, seats, actual) =>
      `Bei proportionaler Vertretung entfielen ${expected} der ${seats} Sitze auf Frauen – tatsächlich sind es ${actual}.`,
    tooltipOf: (n, total) => `${n} von ${total}`,

    // Method
    methodTitle: "So wird gerechnet",
    methodIntro:
      "Die Kennzahl heisst Überlappungskoeffizient. Für jede Gruppe wird der " +
      "kleinere der beiden Anteile genommen – jener im Bundesrat oder jener in " +
      "der Bevölkerung. Die Summe dieser Werte ist die Übereinstimmung.",
    // Non-breaking spaces ( ) so the formula only wraps after "=".
    methodFormula: "Übereinstimmung = Σ min(pᵢ, qᵢ)",
    methodFormulaLegend:
      "p = Anteil im Bundesrat, q = Anteil in der Bevölkerung, i = Gruppe",
    methodTableCaption: "Berechnung mit den aktuellen Zahlen",
    methodColGroup: "Gruppe",
    methodColCouncil: "Bundesrat (p)",
    methodColPopulation: "Bevölkerung (q)",
    methodColMin: "Kleinerer Wert",
    methodTotal: "Übereinstimmung",
    methodTvd:
      "Anders gesagt: Die Übereinstimmung ist 100 % minus die Hälfte aller " +
      "Abweichungen. Diese halbe Abweichungssumme ist in der Politikwissenschaft " +
      "als Loosemore-Hanby-Index bekannt. Die Methode funktioniert mit beliebig " +
      "vielen Gruppen, etwa auch für Sprachregionen oder Parteien.",
    methodSeats: (seats, step) =>
      `Der Bundesrat hat nur ${seats} Sitze. Seine Anteile verändern sich deshalb ` +
      `in Schritten von rund ${step}, und 100 % sind nicht erreichbar. Als ` +
      `Vergleich dient darum der bestmögliche Wert mit ${seats} Sitzen.`,
    methodBinary:
      "Das Bundesamt für Statistik weist die Bevölkerung nach zwei Geschlechtern " +
      "aus. Die Auswertung übernimmt diese Einteilung.",

    // Footer
    sourcesTitle: "Quellen",
    sourcePopulation: (table) =>
      `Bevölkerung: Bundesamt für Statistik (BFS), STAT-TAB, Tabelle ${table}`,
    sourceCouncil: "Bundesrat: eigene Zusammenstellung (all_federal_councillors.csv)",
    dataGenerated: (date) => `Daten aufbereitet am ${date}`,

    // Errors
    loadError:
      "Die Daten konnten nicht geladen werden. Wird die Seite über einen " +
      "lokalen Webserver geöffnet? (siehe README)",

    // Category labels
    female: "Frauen",
    male: "Männer",
    femaleSingular: "Frau",
    maleSingular: "Mann",
  },
};

let lang = "de-CH";

/** Switch the active language (for a future language switcher). */
export function setLanguage(code) {
  if (strings[code]) lang = code;
}

export function getLanguage() {
  return lang;
}

/**
 * Look up a text by key. If the entry is a function, the remaining
 * arguments are passed to it: t("populationSubtitle", 2025).
 */
export function t(key, ...args) {
  const entry = strings[lang][key];
  if (entry === undefined) return `[${key}]`; // makes missing keys visible
  return typeof entry === "function" ? entry(...args) : entry;
}

/** Number and date formatting in the active locale (de-CH: 4’586’802, 78.3). */
export const fmt = {
  int: (n) => new Intl.NumberFormat(lang).format(n),
  dec: (n, digits = 1) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n),
  /** 0.7832 -> "78.3 %" (non-breaking space so it never wraps) */
  pct: (share, digits = 1) => `${fmt.dec(share * 100, digits)} %`,
  /** "2026-10-27" -> "27. Oktober 2026" */
  date: (iso) =>
    new Intl.DateTimeFormat(lang, { day: "numeric", month: "long", year: "numeric" }).format(
      new Date(`${iso.slice(0, 10)}T12:00:00`)
    ),
};
