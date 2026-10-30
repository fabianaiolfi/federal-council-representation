/**
 * config.js — settings that differ between the public site, the beta site
 * and a local copy.
 *
 * The pipeline (.github/workflows/deploy.yml) overwrites this file before
 * publishing, with the Measurement ID stored for each site in GitHub
 * (Settings → Environments → production / beta → variable
 * GA_MEASUREMENT_ID). Keep the values below empty in the repository: then
 * a local copy sends nothing to Google and shows no consent banner.
 */

/** Google Analytics 4 Measurement ID ("G-…"), or "" for no analytics. */
export const GA_MEASUREMENT_ID = "";

/** Send events to the DebugView in Google Analytics (beta site). */
export const GA_DEBUG = false;
