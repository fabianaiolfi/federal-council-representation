/**
 * sources.js — the page "Quellen" (quellen.html): where the data comes
 * from, and the picture credits (author and licence of every portrait,
 * required by several of the licences). Both are read from data/data.json,
 * so they always match the data the app uses.
 */

import { t, fmt, fillText } from "./i18n.js";
import { setupAnalytics } from "./analytics.js";

const $ = (id) => document.getElementById(id);

/** Create an element with optional class and text (text is never parsed as HTML). */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A link that opens another website. */
function link(text, href) {
  const a = el("a", null, text);
  a.href = href;
  a.rel = "noopener";
  return a;
}

/** One line per BFS table (linking to it), then the other sources. */
function renderSources(data) {
  const tables = [data.gender, data.language, data.language.other, data.party];
  const items = tables.map((source) => {
    const li = el("li");
    li.append(link(t("sourceBfs", source.tableTitle, source.table), source.url));
    return li;
  });
  items.push(el("li", null, t("sourceCouncil")), el("li", null, t("sourcePortraits")));
  $("sources-list").replaceChildren(...items);
  $("data-generated").textContent = t("dataGenerated", fmt.date(data.generated));
}

/** Picture credits: "Name: Author, Licence", one line per portrait. */
function renderCredits(data) {
  const people = data.councillors.filter((c) => c.portrait);
  const items = people.map((c) => {
    const p = c.portrait;
    const li = el("li");
    li.append(link(c.name, p.source), document.createTextNode(`: ${p.author || t("creditAuthorUnknown")}, `));
    li.append(p.licenseUrl ? link(p.license, p.licenseUrl) : document.createTextNode(p.license || "–"));
    return li;
  });
  $("credits-list").replaceChildren(...items);
}

async function main() {
  document.title = t("sourcesPageTitle");
  fillText();
  setupAnalytics();
  try {
    const res = await fetch("data/data.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderSources(data);
    renderCredits(data);
  } catch (err) {
    console.error(err);
    const box = $("load-error");
    box.textContent = t("loadError");
    box.hidden = false;
  }
}

main();
