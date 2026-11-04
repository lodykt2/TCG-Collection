// ============================================================
//  charts.js — two tiny charts drawn as SVG (no chart library):
//  a line of owned prints over time, and monthly bars.
// ============================================================
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

/** points: [{ day, value }] → a line with a soft area underneath. */
export function lineChart(points, { color = "#60a5fa", width = 320, height = 90, label = "" } = {}) {
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", height, role: "img", "aria-label": label, preserveAspectRatio: "none" });
  if (!points.length) return svg;
  const vals = points.map((p) => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi === lo) { hi += 1; lo = Math.max(0, lo - 1); }                 // a flat line sits in the middle
  const pad = 6, x = (i) => (i / Math.max(1, points.length - 1)) * width;
  const y = (v) => pad + (1 - (v - lo) / (hi - lo)) * (height - 2 * pad);
  const line = points.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.value).toFixed(1)).join(" ");
  svg.append(el("path", { d: line + ` L${width} ${height} L0 ${height} Z`, fill: color, opacity: "0.12" }),
             el("path", { d: line, fill: "none", stroke: color, "stroke-width": "2", "vector-effect": "non-scaling-stroke" }));
  return svg;
}

/** months: [{ month: "YYYY-MM", added }] → small bars with the month initial under each. */
export function monthBars(months, { color = "#60a5fa", height = 54, label = "" } = {}) {
  const width = months.length * 28;
  const svg = el("svg", { viewBox: `0 0 ${width} ${height + 14}`, width, height: height + 14, role: "img", "aria-label": label });
  const max = Math.max(1, ...months.map((m) => m.added));
  months.forEach((m, i) => {
    const h = m.added ? Math.max(3, (m.added / max) * height) : 0;
    svg.append(el("rect", { x: i * 28 + 4, y: height - h, width: 20, height: h, rx: 3, fill: color, opacity: m.added ? "0.85" : "0" }),
               el("rect", { x: i * 28 + 4, y: height - 1, width: 20, height: 1, fill: color, opacity: "0.3" }));
    const t = el("text", { x: i * 28 + 14, y: height + 12, "text-anchor": "middle", "font-size": "9", fill: "currentColor", opacity: "0.6" });
    t.textContent = new Date(m.month + "-01T00:00:00Z").toLocaleDateString("en", { month: "short", timeZone: "UTC" }).slice(0, 3);
    const tip = el("title", {}); tip.textContent = m.added + " added in " + m.month; svg.append(tip);
    svg.append(t);
  });
  return svg;
}
