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
    pageTitle: "Wie gut bildet der Bundesrat die Bevölkerung ab?",
    pageDescription:
      "Wie gut bildet der Schweizer Bundesrat die Bevölkerung ab? Ein Vergleich nach Geschlecht, " +
      "Partei, Sprache, Alter und Herkunft nach Grossregion, für jeden Bundesrat seit 1848.",

    // Navigation through every version of the Council since 1848
    navLabel: "Zusammensetzung des Bundesrats seit 1848",
    navPrev: "Vorherige Zusammensetzung",
    navNext: "Nächste Zusammensetzung",
    navSlider: "Zusammensetzung auswählen",
    navScoreLabel: "Gesamtübereinstimmung",
    periodCurrent: (startYear) => `${startYear} – Heute`,
    periodYears: (startYear, endYear) => `${startYear} – ${endYear}`,
    periodMonths: (startMonth, endMonth, year) =>
      startMonth === endMonth
        ? `${startMonth} ${year}`
        : `${startMonth} – ${endMonth} ${year}`,

    // Federal Council
    // Title of the navigator: the exact dates the version was in office.
    // The non-breaking space keeps the dash with the first date, so a
    // second line starts with the second date.
    councilPeriodCurrent: (from) => `${from}\u00a0– Heute`,
    councilPeriod: (from, to) => `${from}\u00a0– ${to}`,
    // Replacing a member
    replaceButton: "Ersetzen",
    editButton: "Bearbeiten",
    undoButton: "Rückgängig",
    newFemale: "Neue Bundesrätin",
    newMale: "Neuer Bundesrat",
    newShort: "Neu",
    insteadOf: (name) => `anstelle von ${name}`,
    ageYears: (n) => `${n} Jahre`,
    editorTitle: (name) => `Wer ersetzt ${name}?`,
    editorNoParty: "Keine Parteidaten vor 1919",
    editorDelta: (points, unchanged) =>
      unchanged
        ? "unverändert gegenüber dem aktuellen Bundesrat"
        : `${points} Prozentpunkte gegenüber dem aktuellen Bundesrat`,
    editorDone: "Fertig",
    modeLabel: "Wie möchten Sie ersetzen?",
    mode_custom: "Selbst zusammenstellen",
    mode_list: "Offizielle Kandidierende",
    mode_best: "Bestmögliche Person",
    listEmpty: "Noch keine offiziellen Kandidierenden erfasst.",
    listNoneEligible:
      "Keine der offiziellen Kandidierenden war zu dieser Zeit mindestens 18 Jahre alt.",
    bestIntro: (n) =>
      n === 1
        ? "Die Person, welche die Gesamtübereinstimmung so stark wie möglich erhöht:"
        : `${n} Personen erhöhen die Gesamtübereinstimmung gleich stark. Wählen Sie eine aus:`,
    bestName: (gender, age) => `${gender}, ${age} Jahre`, // a card in "Bestmögliche Person"
    councilWarning:
      "Hinweis: Für heute ist kein vollständiger Bundesrat erfasst. Die Daten sind möglicherweise nicht aktuell.",

    // Comparison
    compareTitle: "Der Bundesrat im Vergleich mit der Schweizer Bevölkerung",
    scoreTitle: "Gesamtübereinstimmung des Bundesrats mit der Bevölkerung",
    overallLabel: "Gesamtübereinstimmung", // in the editor

    overallCaption: (names) =>
      `Durchschnitt aus ${names.length > 1 ? `${names.slice(0, -1).join(", ")} und ${names.at(-1)}` : names[0]}`,
    scoreCaption: "100 % = gleiche Zusammensetzung wie die Bevölkerung",
    compareCouncil: (period) => `Bundesrat ${period}`,
    compareCouncilModified: (period) =>
      `Bundesrat ${period} mit Ihren Änderungen`,

    // Views: the selected Council, or the history chart
    historyTitle: "Verlauf seit 1848",
    historyChartLabel:
      "Stufendiagramm der Gesamtübereinstimmung und der Übereinstimmung nach Geschlecht, Partei, Sprache, Alter und Herkunft nach Grossregion, für jeden Bundesrat seit 1848",
    historyOverall: "Gesamtübereinstimmung",
    historyLegendLabel: "Linie hervorheben",

    // The five comparisons
    compareGender: "Geschlecht",
    compareParty: "Partei",
    compareLanguage: "Sprache",
    compareAge: "Alter",
    compareRegion: "Herkunft nach Grossregion",
    populationYear: (year) => `Bevölkerung ${year}`,
    populationCensus: (year) => `Volkszählung ${year}`,
    populationAdults: (year, minAge) =>
      `Bevölkerung ab ${minAge} Jahren, ${year}`,
    partyElection: (year) => `Nationalratswahl ${year}`,
    // Party and language names are short (labels, cards); the long forms
    // are used in the bar tooltips and for screen readers.
    partyMitte: "Mitte",
    partyMitteLong: "Die Mitte (früher CVP)",
    partyOther: "Übrige",
    partyOtherLong: "Übrige Parteien",
    // Party names as written in the list of councillors, shortened
    partyName: (name) =>
      ({ "Die Mitte": "Mitte", "FDP.Die Liberalen": "FDP" })[name] ?? name,
    partyFurther: "Weitere",
    noDataParty: (year) =>
      `Keine Daten: Die Parteistärken des BFS beginnen mit der Nationalratswahl ${year}.`,
    // ISO 639-1 codes ("other" has none)
    language_de: "DE",
    language_fr: "FR",
    language_it: "IT",
    language_rm: "RM",
    language_other: "Andere",
    languageOtherSingular: "Andere",
    languageName_de: "Deutsch",
    languageName_fr: "Französisch",
    languageName_it: "Italienisch",
    languageName_rm: "Rätoromanisch",
    languageName_other: "Andere Sprachen",
    languageName_otherSingular: "Andere Sprache",
    languageFurther: "Weitere Sprachen",
    languageBreakdownNote: "Aufteilung gemäss Bevölkerung ab 15 Jahren",
    // Grossregionen of the BFS
    region_genfersee: "Genferseeregion",
    region_mittelland: "Espace Mittelland",
    region_nordwestschweiz: "Nordwestschweiz",
    region_zuerich: "Zürich",
    region_ostschweiz: "Ostschweiz",
    region_zentralschweiz: "Zentralschweiz",
    region_tessin: "Tessin",
    ageRange: (min, max) => `${min}–${max} Jahre`,
    ageFrom: (min) => `${min} Jahre und älter`,
    tooltipPersons: (n) => `${n} Personen`,

    // Footer (every page) and the "back" link of the other pages
    footerLabel: "Weitere Seiten",
    sourcesLink: "Quellen",
    privacyLink: "Datenschutzerklärung",
    contactLink: "Kontakt",
    backHome: "Zurück zur Übersicht",
    cantonFlag: (canton) => `Kanton ${canton}`, // the flag on a card (for screen readers)
    readLess: "Weniger", // hides the text again that "Mehr lesen" (+++ in the Markdown) showed

    // Page "Quellen" (quellen.html, sources.js)
    sourcesPageTitle: "Quellen – Wie gut bildet der Bundesrat die Bevölkerung ab?",
    sourcesTitle: "Quellen",
    sourcesData: "Daten",
    sourceBfs: (title, table) =>
      `Bundesamt für Statistik (BFS): ${title} (${table})`,
    // "Bundesrat: … auf Grundlage der [Liste aller Bundesrätinnen und Bundesräte (admin.ch)]; …"
    sourceCouncilBefore: "Bundesrat: eigene Zusammenstellung (all_federal_councillors.csv) auf Grundlage der ",
    sourceCouncilLink: "Liste aller Bundesrätinnen und Bundesräte (admin.ch)",
    sourceCouncilAfter: "; Geburtsdaten und Sprachen: Wikidata",
    sourcePortraits: "Porträts und Kantonsfahnen: Wikimedia Commons (Bildnachweise unten)",
    dataGenerated: (date) => `Daten aufbereitet am ${date}`,
    creditsTitle: "Bildnachweise",
    creditsIntro:
      "Urheber und Lizenz jedes Bildes. Ein Klick auf den Namen öffnet die Bildseite auf Wikimedia Commons.",
    creditsCouncillors: "Mitglieder des Bundesrats",
    creditsCandidates: "Offizielle Kandidierende",
    creditsFlags: "Kantonsfahnen",
    creditAuthorUnknown: "Urheber unbekannt",

    // Consent banner (analytics.js)
    consentLabel: "Einwilligung zur Nutzungsmessung",
    consentText:
      "Darf diese Website mit Google Analytics messen, wie sie genutzt wird? " +
      "Dazu werden Cookies gesetzt und Nutzungsdaten an Google übermittelt, " +
      "auch in die USA. Sie können Ihre Wahl jederzeit ändern.",
    consentPrivacy: "Datenschutzerklärung",
    consentAccept: "Akzeptieren",
    consentDecline: "Ablehnen",
    consentSettings: "Cookie-Einstellungen",

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
 * Fill every element that has a data-i18n="key" attribute with its text,
 * and give every element with data-i18n-label="key" its aria-label.
 */
export function fillText(root = document) {
  document.documentElement.lang = lang;
  for (const node of root.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll("[data-i18n-label]")) {
    node.setAttribute("aria-label", t(node.dataset.i18nLabel));
  }
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
/**
 * A number with its digits grouped only from 5 digits on, and then by a
 * non-breaking space: "2 392 740", "12 500", but "2500" and years ("1850")
 * without a separator. (Intl would write "2’392’740" and "2’500" in de-CH.)
 */
function formatNumber(n, options = {}) {
  const grouped = Math.abs(n) >= 10000;
  return new Intl.NumberFormat(lang, { ...options, useGrouping: grouped })
    .formatToParts(n)
    .map((part) => (part.type === "group" ? "\u00a0" : part.value))
    .join("");
}

export const fmt = {
  int: (n) => formatNumber(n),
  dec: (n, digits = 1) =>
    formatNumber(n, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  /** 0.7832 -> "78.3 %" (non-breaking space so it never wraps) */
  pct: (share, digits = 1) => `${fmt.dec(share * 100, digits)} %`,
  /** "2026-10-27" -> "27. Oktober 2026" */
  date: (iso) =>
    new Intl.DateTimeFormat(lang, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(`${iso.slice(0, 10)}T12:00:00`)),
  /** "2026-10-27" -> "27. Okt. 2026" (standard abbreviations: "März", "Sept.") */
  dateShort: (iso) =>
    new Intl.DateTimeFormat(lang, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(`${iso.slice(0, 10)}T12:00:00`)),
  /** "2026-10-27" -> "27. Okt." (the first date of a range within one year) */
  dayMonthShort: (iso) =>
    new Intl.DateTimeFormat(lang, {
      day: "numeric",
      month: "short",
    }).format(new Date(`${iso.slice(0, 10)}T12:00:00`)),
  /** "2026-10-27" -> "Oktober" */
  month: (iso) =>
    new Intl.DateTimeFormat(lang, { month: "long" }).format(
      new Date(`${iso.slice(0, 10)}T12:00:00`),
    ),
};
