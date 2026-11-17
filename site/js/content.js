/**
 * content.js — the longer texts on the page (intro, method), written in
 * Markdown, one file per language: site/content/<language>/<name>.md.
 *
 * An element with data-content="<name>" is filled with that file, e.g.
 *   <div class="prose" data-content="intro" hidden></div>
 * loads content/de/intro.md (the language from i18n.js). If the file
 * can't be loaded, the element stays hidden; the rest of the page works.
 *
 * Only the Markdown these texts need is supported (no library, so the page
 * still loads nothing from other websites):
 *   # Heading        -> <h2>  (## -> <h3>, ### -> <h4>; the page title is the h1)
 *   paragraphs       separated by a blank line; single line breaks are spaces
 *   - item / 1. item -> lists (each line starting with "- " or "1. " is an item)
 *   **bold**, *italic*, [link text](https://… or quellen.html)
 * Anything else is shown as plain text: HTML in the file is escaped.
 */

import { getLanguage } from "./i18n.js";

const escape = (text) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Links to other websites, pages of this site, anchors or email; nothing else (e.g. "javascript:"). */
const SAFE_HREF = /^(https?:\/\/|mailto:|#|[\w./-]+$)/i;

/** Bold, italic and links within a line (the text is escaped first). */
function inline(text) {
  return escape(text)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
      if (!SAFE_HREF.test(href)) return label;
      const external = /^https?:/i.test(href) ? ' rel="noopener"' : "";
      return `<a href="${href}"${external}>${label}</a>`;
    })
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

/** A list: one item per line that starts with the marker; other lines continue the item. */
function list(lines, marker, tag) {
  const items = [];
  for (const line of lines) {
    if (marker.test(line)) items.push(line.replace(marker, ""));
    else items[items.length - 1] += ` ${line.trim()}`;
  }
  return `<${tag}>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`;
}

/** Markdown (the subset above) -> HTML. */
export function renderMarkdown(source) {
  const blocks = source.replace(/\r\n?/g, "\n").trim().split(/\n[ \t]*\n/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const heading = lines.length === 1 && block.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length + 1;
        return `<h${level}>${inline(heading[2])}</h${level}>`;
      }
      if (/^[-*]\s/.test(lines[0])) return list(lines, /^[-*]\s+/, "ul");
      if (/^\d+\.\s/.test(lines[0])) return list(lines, /^\d+\.\s+/, "ol");
      return `<p>${inline(lines.map((l) => l.trim()).join(" "))}</p>`;
    })
    .join("\n");
}

/** Fill every element with data-content="<name>" with its text in the current language. */
export async function loadContent(root = document) {
  const language = getLanguage().split("-")[0]; // "de-CH" -> "de"
  const nodes = [...root.querySelectorAll("[data-content]")];
  await Promise.all(
    nodes.map(async (node) => {
      try {
        const res = await fetch(`content/${language}/${node.dataset.content}.md`, { cache: "no-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        node.innerHTML = renderMarkdown(await res.text());
        node.hidden = false;
      } catch (err) {
        console.error(`Text "${node.dataset.content}" could not be loaded`, err);
      }
    })
  );
}
