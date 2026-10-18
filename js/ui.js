// ============================================================
//  ui.js — small building blocks used by every page.
//  h() builds elements safely: text is always inserted as text,
//  never as HTML, so card names can't break the page.
// ============================================================

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

export const fmt = (n) => Number(n || 0).toLocaleString("en");
export const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

/** A short message in the corner that disappears by itself. */
export function toast(message, kind = "ok") {
  let box = document.getElementById("toasts");
  if (!box) { box = h("div", { id: "toasts", class: "toasts", "aria-live": "polite" }); document.body.append(box); }
  const t = h("div", { class: "toast toast-" + kind }, message);
  box.append(t);
  setTimeout(() => t.remove(), 3500);
}

/** Opens a dialog. Returns a function that closes it. Esc and clicking outside close it too. */
export function openModal(content, { label = "Dialog", onClose } = {}) {
  const previous = document.activeElement;
  const dialog = h("section", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": label }, content);
  const backdrop = h("div", { class: "modal-backdrop" }, dialog);
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    backdrop.remove(); onClose && onClose();
    previous && previous.focus && previous.focus();
  };
  backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(); });
  backdrop.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  document.body.append(backdrop);
  const first = dialog.querySelector("input, button, select, textarea, a[href]");
  first && first.focus && first.focus();
  return close;
}

/** A stand-in for pages that come in a later stage. */
export function comingLater(title, stage) {
  return h("main", { class: "page narrow" },
    h("h1", { class: "page-title" }, title),
    h("p", { class: "muted" }, "This page is built in stage " + stage + "."));
}

export function errorBox(message, retry) {
  return h("div", { class: "error-box", role: "alert" },
    h("span", {}, message),
    retry && h("button", { class: "btn", onClick: retry }, "Try again"));
}
