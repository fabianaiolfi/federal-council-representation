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
 *   # Title          -> <h1>, the page title (## -> <h2>, ### -> <h3>)
 *   ## Kicker        directly above the # title: the small line above it
 *   paragraphs       separated by a blank line; single line breaks are spaces
 *   - item / 1. item -> lists (each line starting with "- " or "1. " is an item)
 *   **bold**, *italic*, _italic_, `code`, [link text](https://… or quellen.html)
 *   ```              a code block, up to the next ``` line (shown as written)
 *   ---              a dividing line
 *   +++ Mehr lesen   a link with that label; the text after it is hidden
 *                    until the link is pressed, up to a line with just
 *                    +++ (or to the end of the file). Once pressed, the
 *                    link reads "Weniger" (i18n.js: readLess) and hides
 *                    the text again; "+++ Mehr lesen | Weniger anzeigen"
 *                    sets that label too
 * Links to other websites open in a new tab.
 * A space (or none) before "%" becomes a non-breaking space: "28.6 %".
 * Anything else is shown as plain text: HTML in the file is escaped.
 */

import { getLanguage, t } from "./i18n.js";
import { track } from "./analytics.js";

const NBSP = String.fromCharCode(160);
const MARK = String.fromCharCode(1); // around placeholders, never in a text

const escape = (text) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Links to other websites, pages of this site, anchors or email; nothing else (e.g. "javascript:"). */
const SAFE_HREF = /^(https?:\/\/|mailto:|#|[\w./-]+$)/i;

/** Formatting within a line: code, links, bold, italic, the space before "%". */
function inline(text) {
  // Code and link addresses are set aside first, so nothing inside them changes
  const kept = [];
  const keep = (html) => `${MARK}${kept.push(html) - 1}${MARK}`;
  let html = text.replace(/`([^`]+)`/g, (match, code) => keep(`<code>${escape(code)}</code>`));
  html = escape(html).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
    if (!SAFE_HREF.test(href)) return label;
    // Other websites open in a new tab
    const external = /^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : "";
    return `${keep(`<a href="${href}"${external}>`)}${label.trim()}${keep("</a>")}`;
  });
  html = html
    .replace(/(^|[^ \t])[ \t]*%/g, (match, before) => (before ? `${before}${NBSP}%` : match))
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/(^|[^\w])_(?=\S)(.+?)(?<=\S)_(?!\w)/g, "$1<em>$2</em>");
  return html.replace(new RegExp(`${MARK}(\\d+)${MARK}`, "g"), (match, i) => kept[i]);
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

/** A paragraph or a list (lines without a blank line between them). */
function block(lines) {
  if (/^[-*]\s/.test(lines[0])) return list(lines, /^[-*]\s+/, "ul");
  if (/^\d+\.\s/.test(lines[0])) return list(lines, /^\d+\.\s+/, "ol");
  return `<p>${inline(lines.map((l) => l.trim()).join(" "))}</p>`;
}

/**
 * Markdown (the subset above) -> HTML. `id` names the hidden parts
 * ("intro-more-1"), so each button can point to the text it shows.
 */
export function renderMarkdown(source, id = "content") {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let paragraph = []; // lines of the current paragraph or list
  let moreOpen = false;
  let moreCount = 0;
  const flush = () => {
    if (paragraph.length) out.push(block(paragraph));
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*$/.test(line)) {
      flush();
    } else if (/^```/.test(line)) {
      // Code block: every line as written, up to the closing ```
      flush();
      const code = [];
      while (++i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i]);
      out.push(`<pre><code>${escape(code.join("\n"))}</code></pre>`);
    } else if (/^#{1,3}\s/.test(line)) {
      flush();
      const [, hashes, text] = line.match(/^(#{1,3})\s+(.*?)[\s#]*$/);
      const level = hashes.length;
      // "## …" right above the "# …" title is the small line over it
      const previous = out[out.length - 1];
      if (level === 1 && previous?.startsWith("<h2>")) {
        out[out.length - 1] = previous.replace(/^<h2>(.*)<\/h2>$/, '<p class="eyebrow">$1</p>');
      }
      out.push(`<h${level}>${inline(text)}</h${level}>`);
    } else if (/^ {0,3}([-*_])( *\1){2,} *$/.test(line)) {
      flush();
      out.push("<hr>");
    } else if (/^\+\+\+/.test(line)) {
      // "+++ Mehr lesen | Weniger" opens a hidden part, "+++" alone closes it
      flush();
      const [more, less = t("readLess")] = line.replace(/^\+\+\+/, "").split("|").map((s) => s.trim());
      if (moreOpen) out.push("</div>");
      moreOpen = Boolean(more);
      if (moreOpen) {
        const moreId = `${id}-more-${++moreCount}`;
        out.push(
          `<p class="more"><button class="more-link" type="button" aria-expanded="false" ` +
            `aria-controls="${moreId}" data-more="${escape(more)}" data-less="${escape(less)}">${escape(more)}</button></p>`,
          `<div class="more-text" id="${moreId}" hidden>`
        );
      }
    } else {
      paragraph.push(line);
    }
  }
  flush();
  if (moreOpen) out.push("</div>");
  return out.join("\n");
}

/** "Mehr lesen" shows the hidden text and becomes "Weniger", which hides it again. */
function setupMore(node) {
  for (const button of node.querySelectorAll("[data-more]")) {
    button.addEventListener("click", () => {
      const text = document.getElementById(button.getAttribute("aria-controls"));
      const open = text.hidden;
      text.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
      button.textContent = open ? button.dataset.less : button.dataset.more;
      track("read_more", { text: node.dataset.content, action: open ? "open" : "close" });
    });
  }
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
        node.innerHTML = renderMarkdown(await res.text(), node.dataset.content);
        setupMore(node);
        node.hidden = false;
      } catch (err) {
        console.error(`Text "${node.dataset.content}" could not be loaded`, err);
      }
    })
  );
}
