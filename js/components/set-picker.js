// ============================================================
//  set-picker.js — the set menu. Groups open inside the menu
//  (BT ▸ BT1, BT2 …); single sets are plain entries.
// ============================================================
import { h } from "../ui.js";

/**
 * tree: from groupSets(), optionally with extra groups (e.g. binders)
 * options: { value, onChange(value), allLabel?: "All sets" (adds an "everything" entry with value "") }
 */
export function createSetPicker(tree, { value = "", onChange, allLabel = null, ariaLabel = "Set" } = {}) {
  const labelOf = (v) => {
    if (v === "" && allLabel) return allLabel;
    for (const n of tree) {
      if (n.type === "item" && n.value === v) return n.label;
      if (n.type === "group") { const it = n.items.find((i) => i.value === v); if (it) return it.label; }
    }
    return allLabel || "Choose a set";
  };
  const button = h("button", { type: "button", class: "input slim setpick-btn", "aria-haspopup": "true", "aria-expanded": "false", "aria-label": ariaLabel },
    h("span", { class: "setpick-label" }, labelOf(value)), h("span", { "aria-hidden": "true" }, "▾"));
  const pop = h("div", { class: "setpick-pop", hidden: true, role: "menu", "aria-label": ariaLabel });
  const wrap = h("div", { class: "setpick" }, button, pop);

  function choose(v) { value = v; button.firstChild.textContent = labelOf(v); close(); onChange && onChange(v); button.focus(); }
  const itemEl = (it, nested) => h("button", { type: "button", role: "menuitemradio", "aria-checked": String(it.value === value),
    class: "sp-item" + (nested ? " nested" : "") + (it.value === value ? " on" : ""), "data-value": it.value, onClick: () => choose(it.value) }, it.label);

  function draw() {
    pop.replaceChildren(
      allLabel ? itemEl({ value: "", label: allLabel }, false) : null,
      ...tree.map((n) => {
        if (n.type === "item") return itemEl(n, false);
        const holds = n.items.some((i) => i.value === value);
        const kids = h("div", { class: "sp-children", hidden: !holds, role: "group", "aria-label": n.label }, n.items.map((i) => itemEl(i, true)));
        const head = h("button", { type: "button", class: "sp-group" + (holds ? " holds" : ""), "aria-expanded": String(holds), "data-group": n.key },
          h("span", {}, n.label), h("span", { class: "sp-arrow", "aria-hidden": "true" }, holds ? "▾" : "▸"));
        head.addEventListener("click", () => {
          const show = kids.hidden;
          kids.hidden = !show; head.setAttribute("aria-expanded", String(show));
          head.querySelector(".sp-arrow").textContent = show ? "▾" : "▸";
        });
        return h("div", { class: "sp-groupbox" }, head, kids);
      }).filter(Boolean));
  }

  const outside = (e) => { if (!wrap.contains(e.target)) close(); };
  function open() { draw(); pop.hidden = false; button.setAttribute("aria-expanded", "true"); document.addEventListener("mousedown", outside);
    const cur = pop.querySelector(".sp-item.on") || pop.querySelector("button"); cur && cur.focus && cur.focus(); }
  function close() { pop.hidden = true; button.setAttribute("aria-expanded", "false"); document.removeEventListener("mousedown", outside); }
  button.addEventListener("click", () => (pop.hidden ? open() : close()));
  wrap.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) { e.stopPropagation(); close(); button.focus(); } });

  return { el: wrap, get value() { return value; }, set: (v) => { value = v; button.firstChild.textContent = labelOf(v); } };
}

/** groupSets() output → picker tree (adds the value field). */
export const toTree = (groups) => groups.map((n) => n.type === "item"
  ? { type: "item", value: n.code, label: n.label }
  : { type: "group", key: n.key, label: n.label, items: n.items.map((i) => ({ value: i.code, label: i.label })) });
