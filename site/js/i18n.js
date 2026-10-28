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
    // Replacing a member
    replaceHint:
      "Was wäre, wenn …? Ersetzen Sie ein Mitglied und sehen Sie, wie sich die Übereinstimmung verändert.",
    replaceButton: "Ersetzen",
    editButton: "Bearbeiten",
    undoButton: "Rückgängig",
    replacedCount: (n) => (n === 1 ? "1 Mitglied ersetzt" : `${n} Mitglieder ersetzt`),
    resetAll: "Alle zurücksetzen",
    newFemale: "Neue Bundesrätin",
    newMale: "Neuer Bundesrat",
    newShort: "Neu",
    insteadOf: (name) => `anstelle von ${name}`,
    ageYears: (n) => `${n} Jahre`,
    editorTitle: (name) => `Wer ersetzt ${name}?`,
    editorNoParty: "Keine Parteidaten vor 1919",
    editorDelta: (points, unchanged) =>
      unchanged
        ? "unverändert gegenüber dem tatsächlichen Bundesrat"
        : `${points} Prozentpunkte gegenüber dem tatsächlichen Bundesrat`,
    editorDone: "Fertig",
    councilWarning:
      "Hinweis: Für heute ist kein vollständiger Bundesrat erfasst. Die Daten sind möglicherweise nicht aktuell.",

    // Comparison
    compareTitle: "Der Bundesrat im Vergleich mit der Schweizer Bevölkerung",
    overallLabel: "Übereinstimmung insgesamt",
    overallCaption: (names) =>
      `Durchschnitt aus ${names.length > 1 ? `${names.slice(0, -1).join(", ")} und ${names.at(-1)}` : names[0]}`,
    scoreCaption: "100 % = gleiche Zusammensetzung wie die Bevölkerung",
    compareCouncil: (period) => `Bundesrat ${period}`,
    compareCouncilModified: (period) => `Bundesrat ${period} mit Ihren Änderungen`,

    // The four comparisons
    compareGender: "Geschlecht",
    compareParty: "Partei",
    compareLanguage: "Sprache",
    compareAge: "Alter",
    populationYear: (year) => `Bevölkerung ${year}`,
    populationAdults: (year, minAge) => `Bevölkerung ab ${minAge} Jahren, ${year}`,
    partyElection: (year) => `Nationalratswahl ${year}`,
    partyMitte: "Mitte/CVP",
    partyOther: "Übrige Parteien",
    partyFurther: "Weitere",
    noDataParty: (year) => `Keine Daten: Die Parteistärken der BFS beginnen mit der Nationalratswahl ${year}.`,
    language_de: "Deutsch",
    language_fr: "Französisch",
    language_it: "Italienisch",
    language_rm: "Rätoromanisch",
    language_other: "Andere Sprachen",
    languageOtherSingular: "Andere Sprache",
    languageFurther: "Weitere Sprachen",
    languageBreakdownNote: "Aufteilung gemäss Bevölkerung ab 15 Jahren",
    ageRange: (min, max) => `${min}–${max} Jahre`,
    ageFrom: (min) => `${min} Jahre und älter`,
    tooltipPersons: (n) => `${n} Personen`,

    // Footer
    sourcesTitle: "Quellen",
    sourceBfs: (title, table) => `Bundesamt für Statistik (BFS): ${title} (${table})`,
    sourceCouncil:
      "Bundesrat: eigene Zusammenstellung (all_federal_councillors.csv); Geburtsdaten und Sprachen: Wikidata",
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
