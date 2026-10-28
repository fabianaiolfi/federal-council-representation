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

    // Navigation through every version of the Council since 1848
    navLabel: "Zusammensetzung des Bundesrats seit 1848",
    navPrev: "Vorherige Zusammensetzung",
    navNext: "Nächste Zusammensetzung",
    navSlider: "Zusammensetzung auswählen",
    periodCurrent: (startYear) => `${startYear} – heute`,
    periodYears: (startYear, endYear) => `${startYear} – ${endYear}`,
    periodMonths: (startMonth, endMonth, year) =>
      startMonth === endMonth ? `${startMonth} ${year}` : `${startMonth} – ${endMonth} ${year}`,

    // Federal Council
    councilTitle: "Der Bundesrat",
    councilSince: (date) => `Im Amt seit ${date}`,
    councilFromTo: (from, to) => `Im Amt vom ${from} bis ${to}`,
    councilOneDay: (date) => `Im Amt am ${date}`,
    memberLeaving: (date) => `Rücktritt per ${date}`,
    councilWarning:
      "Hinweis: Für heute ist kein vollständiger Bundesrat erfasst. Die Daten sind möglicherweise nicht aktuell.",

    // Comparison
    compareTitle: "Der Vergleich",
    scenarioQuestion: (name) => `Wer folgt auf ${name}?`,
    scenarioToday: "Heute",
    scenarioFemale: "Eine Frau",
    scenarioMale: "Ein Mann",
    scoreLabel: "Übereinstimmung nach Geschlecht",
    scoreCaption: "100 % = gleiche Zusammensetzung wie die Bevölkerung",
    // reference: "today" (scenario) or "previous" (browsing)
    scoreDelta: (pp, direction, reference) => {
      const ref = reference === "today" ? "heute" : "vorher";
      return direction === 0
        ? `Unverändert gegenüber ${ref}`
        : `${direction > 0 ? "+" : "−"}${pp} Prozentpunkte gegenüber ${ref}`;
    },
    compareCouncil: (period) => `Bundesrat ${period}`,
    compareCouncilScenario: "Bundesrat nach der Ersatzwahl",
    comparePopulation: (year) => `Bevölkerung ${year}`,
    tooltipOf: (n, total) => `${n} von ${total} Sitzen`,
    tooltipPersons: (n) => `${n} Personen`,

    // Footer
    sourcesTitle: "Quellen",
    sourcePopulation: (table) =>
      `Bevölkerung: Bundesamt für Statistik (BFS), STAT-TAB, Tabelle ${table}`,
    sourceCouncil: "Bundesrat: eigene Zusammenstellung (all_federal_councillors.csv)",
    sourcePortraits: "Porträts: Wikimedia Commons (Bildnachweise unten)",
    dataGenerated: (date) => `Daten aufbereitet am ${date}`,
    creditsTitle: "Bildnachweise",
    creditAuthorUnknown: "Urheber unbekannt",

    // Errors
    loadError:
      "Die Daten konnten nicht geladen werden. Wird die Seite über einen " +
      "lokalen Webserver geöffnet? (siehe README)",
    renderError:
      "Beim Anzeigen ist ein Fehler aufgetreten. Bitte die Seite ohne Cache " +
      "neu laden (Cmd + Shift + R bzw. Ctrl + Shift + R).",

    // Category labels
    female: "Frauen",
    male: "Männer",
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
 * arguments are passed to it: t("comparePopulation", 2025).
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
  /** "2026-10-27" -> "Oktober" */
  month: (iso) =>
    new Intl.DateTimeFormat(lang, { month: "long" }).format(new Date(`${iso.slice(0, 10)}T12:00:00`)),
};
