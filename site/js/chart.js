/**
 * chart.js — a step line chart drawn as SVG (no library).
 *
 * Time runs along the x-axis, a share (0..1) along the y-axis. Each series
 * holds one value per period; a period is drawn as a horizontal step from
 * its start to its end, so a value stays flat until the next change.
 * Missing values (null) leave a gap.
 *
 * Interaction: hovering shows a tooltip with the values of all series in
 * that period; clicking calls onSelect(period index). The selected period
 * is shaded, with a dot on each line.
 *
 * The chart is redrawn completely on every call (it is small), which also
 * makes it follow the width of its container.
 */

const NS = "http://www.w3.org/2000/svg";

/** Create an SVG element with attributes. */
function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** Create an HTML element with optional class and text. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Draw the chart into `root` (replacing its content).
 *
 * options:
 *   periods   [{ start, end }]   times in ms, oldest first, end = next start
 *   series    [{ label, color, width, values: [0..1 | null] }]
 *             drawn in this order (last on top), listed in the tooltip
 *             in reverse order (top line first)
 *   selected  index of the selected period
 *   describe  (index) => title of a period for the tooltip
 *   format    (value) => text, e.g. "78.3 %"
 *   onSelect  (index) => void, called on click
 *   label     accessible description of the chart
 */
export function drawStepChart(root, { periods, series, selected, describe, format, onSelect, label }) {
  const width = Math.max(280, root.clientWidth || 600);
  const height = Math.round(Math.min(380, Math.max(240, width * 0.5)));
  const m = { top: 12, right: 12, bottom: 28, left: 46 };
  const w = width - m.left - m.right;
  const h = height - m.top - m.bottom;

  const t0 = periods[0].start;
  const t1 = periods[periods.length - 1].end;
  const x = (t) => m.left + ((t - t0) / (t1 - t0)) * w;
  const y = (v) => m.top + (1 - v) * h;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: "img",
    "aria-label": label,
    class: "chart-svg",
  });

  // Horizontal gridlines and y labels: 0 %, 25 %, … 100 %
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    svg.append(
      svgEl("line", { x1: m.left, x2: m.left + w, y1: y(v), y2: y(v), class: v === 0 ? "chart-axis" : "chart-grid" }),
      Object.assign(svgEl("text", { x: m.left - 8, y: y(v), class: "chart-label", "text-anchor": "end", "dominant-baseline": "middle" }), {
        textContent: format(v).replace(/\.0(?=\D)/, ""), // "25 %" rather than "25.0 %"
      })
    );
  }

  // Year labels along the x-axis (every 25 years; every 50 on narrow screens)
  const step = w < 420 ? 50 : 25;
  const firstYear = new Date(t0).getUTCFullYear();
  const lastYear = new Date(t1).getUTCFullYear();
  for (let year = Math.ceil(firstYear / step) * step; year <= lastYear; year += step) {
    const tx = x(Date.UTC(year, 0, 1));
    svg.append(
      svgEl("line", { x1: tx, x2: tx, y1: m.top + h, y2: m.top + h + 4, class: "chart-axis" }),
      Object.assign(svgEl("text", { x: tx, y: m.top + h + 18, class: "chart-label", "text-anchor": "middle" }), {
        textContent: String(year),
      })
    );
  }

  // Shading: the selected period, and the period under the pointer
  const band = (cls) => svgEl("rect", { y: m.top, height: h, class: cls });
  const placeBand = (rect, i) => {
    const x0 = x(periods[i].start);
    rect.setAttribute("x", x0);
    rect.setAttribute("width", Math.max(2, x(periods[i].end) - x0));
  };
  const selectedBand = band("chart-band");
  placeBand(selectedBand, selected);
  const hoverBand = band("chart-band-hover");
  hoverBand.style.display = "none";
  svg.append(selectedBand, hoverBand);

  // One step line per series
  for (const s of series) {
    let d = "";
    let open = false;
    periods.forEach((p, i) => {
      const v = s.values[i];
      if (v === null || v === undefined) {
        open = false; // gap: no data for this period
        return;
      }
      d += open ? ` V${y(v)} H${x(p.end)}` : ` M${x(p.start)} ${y(v)} H${x(p.end)}`;
      open = true;
    });
    const path = svgEl("path", { d: d.trim(), class: "chart-line" });
    path.style.stroke = s.color;
    path.style.strokeWidth = s.width;
    svg.append(path);
  }

  // Dots on each line in the middle of the selected period
  const mid = (x(periods[selected].start) + x(periods[selected].end)) / 2;
  for (const s of series) {
    const v = s.values[selected];
    if (v === null || v === undefined) continue;
    const dot = svgEl("circle", { cx: mid, cy: y(v), r: 4, class: "chart-dot" });
    dot.style.fill = s.color;
    svg.append(dot);
  }

  // Tooltip: values of all series in the period under the pointer
  const tooltip = el("div", "chart-tooltip");
  tooltip.hidden = true;
  const periodAt = (clientX) => {
    const box = svg.getBoundingClientRect();
    const t = t0 + ((clientX - box.left - m.left) / w) * (t1 - t0);
    let i = 0;
    while (i < periods.length - 1 && periods[i + 1].start <= t) i++;
    return i;
  };
  const showTooltip = (i, clientX, clientY) => {
    placeBand(hoverBand, i);
    hoverBand.style.display = "";
    const rows = el("ul", "chart-tooltip-rows");
    for (const s of [...series].reverse()) {
      const v = s.values[i];
      const li = el("li");
      const key = el("span", "key-line");
      key.style.background = s.color;
      li.append(key, el("strong", null, v === null || v === undefined ? "–" : format(v)), el("span", null, s.label));
      rows.append(li);
    }
    tooltip.replaceChildren(el("p", "chart-tooltip-title", describe(i)), rows);
    tooltip.hidden = false;
    // Next to the pointer, kept inside the chart
    const box = root.getBoundingClientRect();
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let left = clientX - box.left + 14;
    if (left + tw > box.width) left = clientX - box.left - tw - 14;
    const top = Math.min(Math.max(0, clientY - box.top - th / 2), box.height - th);
    tooltip.style.left = `${Math.max(0, left)}px`;
    tooltip.style.top = `${top}px`;
  };
  const hide = () => {
    tooltip.hidden = true;
    hoverBand.style.display = "none";
  };

  // Transparent layer over the plot area that catches the pointer
  const hit = svgEl("rect", { x: m.left, y: m.top, width: w, height: h, class: "chart-hit" });
  hit.addEventListener("pointermove", (e) => showTooltip(periodAt(e.clientX), e.clientX, e.clientY));
  hit.addEventListener("pointerleave", hide);
  hit.addEventListener("click", (e) => onSelect(periodAt(e.clientX)));
  svg.append(hit);

  root.replaceChildren(svg, tooltip);
}
