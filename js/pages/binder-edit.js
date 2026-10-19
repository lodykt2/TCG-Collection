// ============================================================
//  binder-edit.js — create or change a binder: name, pages, reading
//  order, sets in order, empty pages / pockets. Shows live whether
//  everything fits.
// ============================================================
import { h, fmt, errorBox, toast } from "../ui.js";
import { layoutBinder, pagesForCards } from "../lib/binder-layout.js";
import { cardsBySetFor, SET_COLORS } from "./binders.js";
import { GAMES } from "../config.js";
import { link, go } from "../router.js";
import { state, loadGame, loadSets, loadBinders, saveBinder, deleteBinder } from "../store.js";
import { explain } from "../supabase.js";

export function binderEditPage(game, id) {
  const meta = GAMES.find((g) => g.id === game);
  const root = h("main", { class: "page binder-edit" }, h("p", { class: "muted" }, "Loading…"));
  let sets = [], others = [], draft = null, bySet = null;

  Promise.all([loadGame(game), loadSets(game), loadBinders(game)])
    .then(([, s, binders]) => {
      sets = s; bySet = cardsBySetFor(game, sets);
      const existing = id ? binders.find((b) => b.id === id) : null;
      if (id && !existing) { root.replaceChildren(errorBox("That binder doesn't exist anymore.")); return; }
      others = binders.filter((b) => b.id !== id);
      draft = existing
        ? { id: existing.id, name: existing.name, pages: existing.pages, reading_order: existing.reading_order,
            sets: existing.sets.map((x) => ({ ...x })), adjustments: existing.adjustments.map((x) => ({ ...x })) }
        : { id: null, name: "", pages: state.settings.binderPages || 100, reading_order: state.settings.readingOrder || "rtl", sets: [], adjustments: [] };
      build();
    })
    .catch((err) => root.replaceChildren(errorBox("Couldn't load: " + explain(err), () => location.reload())));

  const setsEl = h("div", { class: "stack" });
  const addEl = h("div", { class: "add-grid" });
  const adjEl = h("div", { class: "stack" });
  const spaceEl = h("aside", { class: "panel space" });
  const errEl = h("p", { class: "form-error", role: "alert" });

  function build() {
    const name = h("input", { class: "input", value: draft.name, "aria-label": "Binder name", placeholder: "e.g. BT1 – BT3" });
    name.addEventListener("input", () => { draft.name = name.value; });
    const pages = h("input", { class: "input", type: "number", min: "1", max: "1000", value: draft.pages, "aria-label": "Pages in your binder" });
    pages.addEventListener("input", () => { draft.pages = Math.max(1, Math.min(1000, Number(pages.value) || 1)); redraw(); });
    const order = h("div", { class: "segmented", role: "group", "aria-label": "Reading order" });
    for (const [v, t] of [["ltr", "Left → right"], ["rtl", "Right → left"]]) {
      const b = h("button", { type: "button", class: draft.reading_order === v ? "on" : "", "aria-pressed": String(draft.reading_order === v) }, t);
      b.addEventListener("click", () => { draft.reading_order = v; for (const x of order.children) { x.className = ""; x.setAttribute("aria-pressed", "false"); } b.className = "on"; b.setAttribute("aria-pressed", "true"); });
      order.append(b);
    }
    const saveBtn = h("button", { class: "btn btn-primary", onClick: save }, "Save binder");
    root.replaceChildren(
      h("div", { class: "edit-top" },                       // stays at the top while you scroll
      h("div", { class: "page-head" },
        h("div", {}, h("div", { class: "mono muted" }, h("a", { href: link(game + "/binders" + (id ? "/" + id : "")) }, "Binders"), " › " + (id ? draft.name : "New")),
          h("h1", { class: "page-title" }, id ? "Edit binder" : "New binder")),
        h("div", { class: "row wrap" },
          id && h("button", { class: "btn btn-danger", onClick: remove }, "Delete binder"),
          h("a", { class: "btn", href: link(game + "/binders" + (id ? "/" + id : "")) }, "Cancel"),
          saveBtn)),
      errEl,
      h("section", { class: "panel details" },
        h("label", { class: "field wide" }, "Name", name),
        h("label", { class: "field" }, "Pages in your binder", pages),
        h("div", { class: "field" }, "Pockets", h("span", { class: "fixed" }, "2 × 2")),
        h("div", { class: "field wide" }, "Reading order", order))),
      h("div", { class: "edit-cols" },
        h("div", { class: "stack edit-main" },
          h("section", { class: "panel dashed stack" },
            h("span", { class: "strong" }, "Empty pages & pockets ", h("span", { class: "muted" }, "· match your physical binder")),
            adjEl,
            h("div", { class: "row wrap" },
              h("button", { class: "btn btn-accent", onClick: () => { draft.adjustments.push({ kind: "empty_pages", after_kind: draft.sets.length ? "set" : "start", after_value: draft.sets[0] ? draft.sets[0].code : null, count: 1 }); redraw(); } }, "+ Empty pages"),
              h("button", { class: "btn", onClick: () => { draft.adjustments.push({ kind: "empty_pockets", after_kind: "card", after_value: "", count: 1 }); redraw(); } }, "+ Empty pockets"))),
          h("section", { class: "stack" }, h("h2", { class: "section-title" }, "Sets in this binder"),
            h("p", { class: "muted small" }, "Whole sets, cards in card number order."), setsEl),
          h("section", { class: "stack" }, h("h2", { class: "section-title" }, "Add a set"), addEl)),
        spaceEl));
    redraw();
  }

  const layoutNow = () => layoutBinder(draft, bySet);
  const setName = (code) => { const s = sets.find((x) => x.code === code); return s ? s.name : ""; };
  const ownerOf = (code) => others.find((b) => b.sets.some((s) => s.code === code));

  function redraw() {
    const L = layoutNow();
    // sets in the binder
    setsEl.replaceChildren(...(draft.sets.length ? draft.sets.map((s, i) => {
      const cards = (bySet.get(s.code) || []);
      const have = cards.filter((c) => c.collected).length;
      const startPage = L.pages.find((p) => p.set === s.code);
      const newPage = h("input", { type: "checkbox", checked: s.new_page !== false });
      newPage.addEventListener("change", () => { s.new_page = newPage.checked; redraw(); });
      return h("div", { class: "set-row" },
        h("span", { class: "swatch", style: { background: SET_COLORS[i % SET_COLORS.length] } }),
        h("span", { class: "set-text" }, h("span", { class: "strong" }, h("span", { class: "mono muted" }, s.code + " "), setName(s.code)),
          h("span", { class: "muted small" }, fmt(cards.length) + " cards · " + pagesForCards(cards.length) + " pages · " + fmt(have) + " collected"
            + (startPage ? " · starts on page " + startPage.n : ""))),
        h("label", { class: "row small" }, newPage, "Start on a new page"),
        h("button", { class: "btn btn-icon", "aria-label": "Move " + s.code + " up", disabled: i === 0, onClick: () => move(i, -1) }, "↑"),
        h("button", { class: "btn btn-icon", "aria-label": "Move " + s.code + " down", disabled: i === draft.sets.length - 1, onClick: () => move(i, 1) }, "↓"),
        h("button", { class: "btn btn-icon danger", "aria-label": "Remove " + s.code, onClick: () => { draft.sets.splice(i, 1); redraw(); } }, "✕"));
    }) : [h("p", { class: "muted" }, "No sets yet — add one below.")]));

    // sets that can be added
    const inDraft = new Set(draft.sets.map((s) => s.code));
    // sets already in another binder are hidden — a set can only be in one binder
    const withCards = sets.filter((s) => (bySet.get(s.code) || []).length && !inDraft.has(s.code));
    const candidates = withCards.filter((s) => !ownerOf(s.code));
    const hiddenCount = withCards.length - candidates.length;
    addEl.replaceChildren(...(candidates.length ? [] : [h("p", { class: "muted" }, "Every set is already in a binder.")]),
      ...(hiddenCount ? [h("p", { class: "muted small add-note" }, hiddenCount + (hiddenCount === 1 ? " set is" : " sets are") + " already in other binders and not shown.")] : []),
      ...candidates.map((s) => {
      const owner = ownerOf(s.code);
      const n = (bySet.get(s.code) || []).length, need = pagesForCards(n);
      const after = L.used + need;
      const fits = after <= draft.pages;
      return h("div", { class: "add-row" + (owner ? " taken" : "") },
        h("span", { class: "set-text" }, h("span", { class: "strong" }, h("span", { class: "mono muted" }, s.code + " "), s.name),
          h("span", { class: "small " + (owner ? "muted" : fits ? "ok-text" : "warn-text") },
            owner ? "In binder “" + owner.name + "”" : fmt(n) + " cards · " + need + " pages · " + (fits ? "fits" : "won't fit") + " (" + after + " of " + draft.pages + ")")),
        !owner && h("button", { class: "btn btn-accent", onClick: () => { draft.sets.push({ code: s.code, new_page: true }); redraw(); } }, "+ Add"));
    }));

    // empty pages / pockets
    adjEl.replaceChildren(...(draft.adjustments.length ? draft.adjustments.map((a, i) => adjustmentRow(a, i)) : [h("p", { class: "muted small" }, "None — add empty pages or pockets to match your real binder.")]));

    // space panel
    const colorOf = new Map(draft.sets.map((s, i) => [s.code, SET_COLORS[i % SET_COLORS.length]]));
    const total = Math.max(L.used, draft.pages);
    spaceEl.replaceChildren(
      h("span", { class: "eyebrow" }, "Space in this binder"),
      h("span", { class: "big-number" + (L.fits ? "" : " bad-text") }, String(L.used), h("span", { class: "big-number-sub" }, " of " + draft.pages + " pages")),
      h("span", { class: L.fits ? "muted" : "warn-text" }, L.fits
        ? (draft.pages - L.used) + " pages free · room for up to " + fmt((draft.pages - L.used) * 4) + " more cards"
        : "Doesn't fit: " + (L.used - draft.pages) + " pages too many"),
      h("div", { class: "page-map" }, Array.from({ length: total }, (_, k) => {
        const p = L.pages[k];
        const cls = !p ? "free" : p.kind === "empty" ? "empty" : "";
        const what = !p ? "not used" : p.kind === "empty" ? "empty page" : p.set;
        return h("span", { class: "map-cell " + cls + (k >= draft.pages ? " over" : ""), style: p && p.set ? { background: colorOf.get(p.set) } : null,
                           title: "Page " + (k + 1) + " · " + what + (k >= draft.pages ? " · beyond your binder" : "") });
      })),
      h("div", { class: "row wrap small map-legend" },
        h("span", { class: "legend" }, h("span", { class: "map-cell empty" }), "empty page"),
        h("span", { class: "legend" }, h("span", { class: "map-cell free" }), "not used"),
        L.used > draft.pages && h("span", { class: "legend" }, h("span", { class: "map-cell over" }), "beyond your binder")),
      h("div", { class: "stack-tight small" }, draft.sets.map((s) => {
        const pg = L.pages.filter((p) => p.set === s.code);
        return pg.length ? h("span", { class: "legend" }, h("span", { class: "legend-dot", style: { background: colorOf.get(s.code) } }),
          s.code + " · pages " + pg[0].n + "–" + pg[pg.length - 1].n) : null;
      })));
  }

  function adjustmentRow(a, i) {
    const count = h("input", { class: "input slim num", type: "number", min: "1", max: "200", value: a.count, "aria-label": "How many" });
    count.addEventListener("input", () => { a.count = Math.max(1, Math.min(200, Number(count.value) || 1)); redraw(); });
    let where;
    if (a.kind === "empty_pages") {
      const options = [["start:", "at the start"], ...draft.sets.map((s) => ["set:" + s.code, "after " + s.code]), ["page:", "after page…"]];
      const current = a.after_kind === "page" ? "page:" : a.after_kind + ":" + (a.after_kind === "set" ? a.after_value : "");
      const sel = h("select", { class: "input slim", "aria-label": "Where" }, options.map(([v, t]) => h("option", { value: v, selected: v === current }, t)));
      sel.addEventListener("change", () => { const [k, v] = sel.value.split(":"); a.after_kind = k; a.after_value = k === "page" ? (a.after_value || "1") : (v || null); redraw(); });
      const pageNo = a.after_kind === "page" && h("input", { class: "input slim num", type: "number", min: "1", value: a.after_value || 1, "aria-label": "Page number" });
      if (pageNo) pageNo.addEventListener("change", () => { a.after_value = String(Math.max(1, Number(pageNo.value) || 1)); redraw(); });
      where = [sel, pageNo];
    } else {
      const card = h("input", { class: "input slim", value: a.after_value || "", placeholder: "card number, e.g. BT1-010", "aria-label": "After card" });
      card.addEventListener("change", () => { a.after_value = card.value.trim().toUpperCase(); redraw(); });
      where = [h("span", { class: "muted small" }, "after card"), card];
    }
    return h("div", { class: "adj-row" }, count,
      h("span", {}, a.kind === "empty_pages" ? "empty pages" : "empty pockets"), where,
      h("span", { class: "spacer" }),
      h("button", { class: "btn btn-icon danger", "aria-label": "Remove", onClick: () => { draft.adjustments.splice(i, 1); redraw(); } }, "✕"));
  }

  function move(i, d) { const [s] = draft.sets.splice(i, 1); draft.sets.splice(i + d, 0, s); redraw(); }

  async function save() {
    errEl.textContent = "";
    if (!draft.name.trim()) { errEl.textContent = "Give the binder a name."; return; }
    const bad = draft.adjustments.find((a) => a.kind === "empty_pockets" && !(bySet && [...bySet.values()].flat().some((c) => c.number === a.after_value)));
    if (bad) { errEl.textContent = "Empty pockets: “" + (bad.after_value || "") + "” isn't a card in this binder."; return; }
    try {
      const newId = await saveBinder({ ...draft, game, adjustments: draft.adjustments.map(({ kind, after_kind, after_value, count }) => ({ kind, after_kind, after_value, count })) });
      toast("Binder saved");
      go(game + "/binders/" + newId);
    } catch (err) { errEl.textContent = explain(err); }
  }

  async function remove() {
    if (!confirm("Delete the binder “" + draft.name + "”? Your cards and owned marks are not affected.")) return;
    try { await deleteBinder(game, id); toast("Binder deleted"); go(game + "/binders"); }
    catch (err) { errEl.textContent = explain(err); }
  }

  // Background updates must never rebuild the form while you're editing it.
  return { el: root, update() {} };
}
