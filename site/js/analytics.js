/**
 * analytics.js — Google Analytics 4, only with the visitor's consent.
 *
 * Until the visitor clicks "Akzeptieren" in the consent banner, nothing is
 * loaded from Google, no cookie is set and track() does nothing. The choice
 * is kept in the browser (localStorage) and can be changed at any time with
 * the "Cookie-Einstellungen" button in the footer of every page.
 *
 * Used by both pages: index.html (via app.js) and datenschutz.html.
 * Without a Measurement ID in config.js (e.g. when running locally) there is
 * no banner and no button, and nothing is ever sent.
 *
 * Events and their parameters are listed in the README ("Google Analytics").
 */

import { t } from "./i18n.js";
import { GA_MEASUREMENT_ID, GA_DEBUG } from "./config.js";

const STORAGE_KEY = "analytics-consent"; // "granted" | "denied"

let loaded = false; // gtag.js has been loaded (consent given)
const sentOnce = new Set(); // events sent with trackOnce()

// --- Consent ------------------------------------------------------------------

/** The stored choice, or null if the visitor has not decided yet. */
function storedConsent() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage blocked: ask again on every visit
  }
}

function storeConsent(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // storage blocked: the choice applies to this page view only
  }
}

/**
 * Start Google Analytics. Advertising features stay off: no Google signals,
 * no ad personalisation, no ad cookies.
 */
function load() {
  if (loaded) return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  // gtag.js expects the `arguments` object itself, not an array
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ...(GA_DEBUG && { debug_mode: true }),
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  document.head.append(script);
}

/**
 * Consent withdrawn: delete the Google Analytics cookies (_ga, _ga_…) and
 * reload, so that gtag.js is no longer running on the page.
 */
function withdraw() {
  const names = document.cookie
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter((name) => name === "_ga" || name.startsWith("_ga_"));
  // The cookies are set on the site's domain; try it and its parents
  const parts = location.hostname.split(".");
  const domains = parts.map((_, i) => parts.slice(i).join("."));
  for (const name of names) {
    document.cookie = `${name}=; Max-Age=0; path=/`;
    for (const domain of domains) document.cookie = `${name}=; Max-Age=0; path=/; domain=.${domain}`;
  }
  location.reload();
}

function decide(value) {
  const before = storedConsent();
  storeConsent(value);
  closeBanner();
  if (value === "granted") load();
  else if (before === "granted" || loaded) withdraw();
}

// --- Banner -------------------------------------------------------------------

let banner = null;

/** The consent banner at the bottom of the screen (built on first use). */
function openBanner() {
  if (!banner) {
    banner = document.createElement("section");
    banner.className = "consent";
    banner.setAttribute("aria-label", t("consentLabel"));

    const text = document.createElement("p");
    text.className = "consent-text";
    const link = document.createElement("a");
    link.href = "datenschutz.html";
    link.textContent = t("consentPrivacy");
    text.append(document.createTextNode(`${t("consentText")} `), link);

    // Both choices look the same: declining is as easy as accepting
    const buttons = document.createElement("div");
    buttons.className = "consent-buttons";
    for (const [value, key] of [["granted", "consentAccept"], ["denied", "consentDecline"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button";
      button.textContent = t(key);
      button.addEventListener("click", () => decide(value));
      buttons.append(button);
    }

    banner.append(text, buttons);
    // First in the page, so keyboard and screen reader users meet it first
    document.body.prepend(banner);
  }
  banner.hidden = false;
}

function closeBanner() {
  if (banner) banner.hidden = true;
}

// --- Public ---------------------------------------------------------------------

/**
 * Call once per page: shows the banner if the visitor has not decided yet,
 * starts Google Analytics if they have agreed, and wires up the
 * "Cookie-Einstellungen" buttons (elements with data-consent-settings).
 */
export function setupAnalytics() {
  if (!GA_MEASUREMENT_ID) return;
  for (const button of document.querySelectorAll("[data-consent-settings]")) {
    button.textContent = t("consentSettings");
    button.hidden = false;
    button.addEventListener("click", openBanner);
  }
  const consent = storedConsent();
  if (consent === "granted") load();
  else if (consent !== "denied") openBanner();
}

/**
 * Send an event to Google Analytics (does nothing without consent).
 * Parameter values must not contain anything about the visitor.
 */
export function track(name, params = {}) {
  if (loaded) window.gtag("event", name, params);
}

/** Like track(), but at most once per page view for the same name and parameters. */
export function trackOnce(name, params = {}) {
  const key = `${name} ${JSON.stringify(params)}`;
  if (!loaded || sentOnce.has(key)) return;
  sentOnce.add(key);
  track(name, params);
}
