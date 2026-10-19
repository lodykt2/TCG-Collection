// ============================================================
//  progress.js — a progress bar with a label ("Loading images 12 / 66").
// ============================================================
import { h } from "../ui.js";

export function createProgress() {
  const fill = h("span", { class: "progress-fill" });
  const label = h("span", { class: "progress-label" });
  const el = h("div", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", hidden: true },
    h("span", { class: "progress-track" }, fill), label);
  return {
    el,
    /** set(done, total, text) — or set(null, null, text) for a step without a count */
    set(done, total, text) {
      el.hidden = false;
      const pct = total ? Math.round((done / total) * 100) : 100;
      fill.style.width = pct + "%";
      fill.className = "progress-fill" + (total ? "" : " busy");
      el.setAttribute("aria-valuenow", String(pct));
      label.textContent = text + (total ? "  " + done + " / " + total : "");
    },
    finish(text = "Done") {
      el.hidden = false;
      fill.style.width = "100%"; fill.className = "progress-fill";
      el.setAttribute("aria-valuenow", "100");
      label.textContent = text;
    },
    hide() { el.hidden = true; },
  };
}

/** A floating panel in the corner, for work that continues after a window closes. */
export function floatingProgress(title) {
  const p = createProgress();
  const panel = h("div", { class: "progress-panel", role: "status" }, h("span", { class: "strong small" }, title), p.el);
  document.body.append(panel);
  return { ...p, close: () => panel.remove() };
}
