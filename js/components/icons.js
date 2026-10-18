// Small game symbols (our own drawings, not the official logos),
// built with real SVG elements so no HTML strings are involved.
const NS = "http://www.w3.org/2000/svg";
const SHAPES = {
  digimon:  [["path", { d: "M12 2l8.66 5v10L12 22l-8.66-5V7z", fill: "none", "stroke-width": 2, "stroke-linejoin": "round" }],
             ["circle", { cx: 12, cy: 12, r: 3, filled: true }]],
  gundam:   [["path", { d: "M12 2l10 10-10 10L2 12z", fill: "none", "stroke-width": 2, "stroke-linejoin": "round" }],
             ["path", { d: "M12 7l5 5-5 5-5-5z", filled: true }]],
  palworld: [["path", { d: "M5 19C5 11 11 5 20 5c0 9-6 14-14 14", fill: "none", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }],
             ["path", { d: "M5 19l8-8", "stroke-width": 2, "stroke-linecap": "round" }]],
  home:     [["path", { d: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z", fill: "none", "stroke-width": 2, "stroke-linejoin": "round" }]],
};

export function icon(name, color = "currentColor", size = 18) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", size); svg.setAttribute("height", size);
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "icon");
  for (const [tag, attrs] of SHAPES[name] || []) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (k !== "filled") el.setAttribute(k, v);
    if (attrs.filled) el.setAttribute("fill", color); else el.setAttribute("stroke", color);
    svg.append(el);
  }
  return svg;
}
