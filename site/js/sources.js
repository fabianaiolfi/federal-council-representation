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

/** A link that opens another website, in a new tab. */
function link(text, href) {
  const a = el("a", null, text);
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  return a;
}

/** Where data/all_federal_councillors.csv comes from */
const COUNCIL_LIST_URL = "https://www.admin.ch/de/alle-bundesraete";

/** One line per BFS table (linking to it), then the other sources. */
function renderSources(data) {
  const tables = [data.gender, data.language, data.language.other, data.party, data.region, data.region.annual];
  const items = tables.map((source) => {
    const li = el("li");
    li.append(link(t("sourceBfs", source.tableTitle, source.table), source.url));
    return li;
  });
  // The list of councillors is based on the official list of the Confederation
  const council = el("li", null, t("sourceCouncilBefore"));
  council.append(link(t("sourceCouncilLink"), COUNCIL_LIST_URL), t("sourceCouncilAfter"));
  items.push(council, el("li", null, t("sourcePortraits")));
  $("sources-list").replaceChildren(...items);
  $("data-generated").textContent = t("dataGenerated", fmt.date(data.generated));
}

/** One credit line: "Name: Author, Licence" (the name links to the image on Commons). */
function creditItem(name, p) {
  const li = el("li");
  li.append(link(name, p.source), document.createTextNode(`: ${p.author || t("creditAuthorUnknown")}, `));
  li.append(p.licenseUrl ? link(p.license, p.licenseUrl) : document.createTextNode(p.license || "–"));
  return li;
}

/** Picture credits in three groups: councillors, candidates, canton flags. */
function renderCredits(data) {
  const groups = [
    [t("creditsCouncillors"), data.councillors.filter((c) => c.portrait).map((c) => creditItem(c.name, c.portrait))],
    [t("creditsCandidates"), (data.candidates ?? []).filter((c) => c.portrait).map((c) => creditItem(c.name, c.portrait))],
    [t("creditsFlags"), Object.values(data.flags ?? {}).map((f) => creditItem(t("cantonFlag", f.canton), f))],
  ];
  $("credits").replaceChildren(
    ...groups
      .filter(([, items]) => items.length)
      .flatMap(([title, items]) => {
        const list = el("ul", "source-list credits-list");
        list.append(...items);
        return [el("h3", null, title), list];
      })
  );
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
