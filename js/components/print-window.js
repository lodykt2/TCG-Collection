// ============================================================
//  print-window.js — the shared print window.
//  From the collection it starts in "Full cards"; from a binder
//  in "Placeholders". Inside, you can switch either one.
// ============================================================
import { h, openModal, toast, fmt } from "../ui.js";
import { cardImage } from "../images.js";
import { sortCards, sortPrints, basePrint } from "../cards.js";
import { state, loadGame, loadSets, loadBinders } from "../store.js";
import { layoutBinder } from "../lib/binder-layout.js";
import { sb, explain } from "../supabase.js";
import { buildPdf, sheetsNeeded, PER_SHEET } from "../lib/pdf.js";
import { loadMany, download } from "../lib/image-data.js";
import { GAMES } from "../config.js";
import { createProgress } from "./progress.js";
import { createSetPicker, toTree } from "./set-picker.js";
import { groupSets } from "../lib/set-groups.js";

/**
 * options: { game, mode: "full" | "placeholder", source: { type: "set", code } | { type: "binder", id },
 *            preselect: "missing" | print ids[] }
 */
export async function openPrintWindow({ game, mode = "full", source, preselect = "missing" }) {
  const [data, sets] = await Promise.all([loadGame(game), loadSets(game)]);
  const binders = await loadBinders(game);
  const visibleBySet = () => {
    const m = new Map();
    for (const c of sortCards(data.cards, sets)) if (c.visible) { if (!m.has(c.set)) m.set(c.set, []); m.get(c.set).push(c); }
    return m;
  };
  let layout = null;                                 // where each card sits, when printing from a binder
  const setsWithCards = sets.filter((s) => data.cards.some((c) => c.set === s.code && c.visible));
  if (!source) source = { type: "set", code: setsWithCards[0] && setsWithCards[0].code };

  let show = "missing";                         // which cards are listed: missing | all
  const selected = new Set();
  let busy = false;

  const listEl = h("div", { class: "pw-list" });
  const previewEl = h("div", { class: "pw-sheet" });
  const summaryEl = h("span", { class: "pw-summary" });
  const noteEl = h("p", { class: "muted small" });
  const cut = h("input", { type: "checkbox", checked: state.settings.cutLines });
  const showWhere = h("input", { type: "checkbox", checked: true });
  showWhere.addEventListener("change", () => refreshSide());
  const whereRow = h("label", { class: "row small" }, showWhere, "Show binder location on each placeholder");
  const printBtn = h("button", { class: "btn btn-primary", onClick: () => makePdf() }, "Download PDF");
  const progress = createProgress();

  // ── source: a set, or a binder's sets in binder order ──
  function sourceCards() {
    if (source.type === "binder") {
      const b = binders.find((x) => x.id === source.id);
      if (!b) return [];
      layout = layoutBinder(b, visibleBySet());
      // binder order: page by page, pocket by pocket
      return [...layout.where.entries()].sort((x, y) => x[1].page - y[1].page || x[1].pocket - y[1].pocket)
        .map(([n]) => data.byNumber.get(n));
    }
    layout = null;
    return sortCards(data.cards.filter((c) => c.set === source.code && c.visible), sets);
  }
  const whereText = (card) => {
    if (!layout) return "";
    const w = layout.where.get(card.number), b = binders.find((x) => x.id === source.id);
    return w ? b.name + " · page " + w.page + " · pocket " + w.pocket : "";
  };

  function listed() { const all = sourceCards(); return show === "missing" ? all.filter((c) => !c.collected) : all; }

  function selectMissing({ withAlts = false } = {}) {
    for (const c of sourceCards()) {
      if (c.collected) continue;
      selected.add(basePrint(c).id);
      if (withAlts) for (const p of c.prints) if (!p.hidden) selected.add(p.id);
    }
  }

  // ── what will be printed, in order ──
  function chosen() {
    const out = [];
    for (const c of sourceCards()) for (const p of sortPrints(c.prints)) if (selected.has(p.id)) out.push({ card: c, print: p });
    return out;
  }

  // ── drawing ──
  function drawList() {
    const cards = listed();
    listEl.replaceChildren(...(cards.length ? cards.map(row) : [h("p", { class: "empty" }, show === "missing" ? "Nothing missing here." : "No cards.")]));
  }

  function row(c) {
    return h("div", { class: "pw-row" },
      h("span", { class: "pw-card" }, h("span", { class: "strong" }, c.name),
        h("span", { class: "mono muted" }, c.number + " · " + (c.rarity || "—") + " · " + (c.collected ? "collected" : "missing"))),
      h("span", { class: "pw-prints" }, sortPrints(c.prints).filter((p) => !p.hidden || state.settings.showHidden).map(chip)));
  }

  function chip(p) {
    const box = h("input", { type: "checkbox", checked: selected.has(p.id), "aria-label": "Print " + p.id });
    box.addEventListener("change", () => { if (box.checked) selected.add(p.id); else selected.delete(p.id); chipEl.className = chipClass(); refreshSide(); });
    const chipClass = () => "pw-chip" + (selected.has(p.id) ? " on" : "");
    const chipEl = h("label", { class: chipClass() },
      cardImage(p, { className: "pw-thumb" }),
      h("span", { class: "pw-chip-text" }, h("span", { class: "strong small" }, p.variant),
        h("span", { class: "muted small" }, p.owned ? "owned" : "not owned")),
      box);
    return chipEl;
  }

  function refreshSide() {
    const items = chosen();
    const cards = new Set(items.map((x) => x.card.number)).size;
    const alts = items.filter((x) => x.print.variant !== "Base").length;
    const plural = (n, one, many) => fmt(n) + " " + (n === 1 ? one : many);
    summaryEl.textContent = fmt(items.length) + " selected · " + plural(items.length - alts, "card", "cards") + " · " + plural(alts, "alt art", "alt arts") + " · "
      + sheetsNeeded(items.length) + (sheetsNeeded(items.length) === 1 ? " sheet" : " sheets");
    printBtn.disabled = busy || items.length === 0;
    previewEl.className = "pw-sheet " + (mode === "full" ? "full" : "placeholder");
    previewEl.replaceChildren(...items.slice(0, PER_SHEET).map(({ card, print }) => mode === "full"
      ? h("div", { class: "pw-cell" }, cardImage(print, { className: "pw-cell-img" }))
      : h("div", { class: "pw-cell" },
          cardImage(print, { className: "pw-cell-img gray" }),
          showWhere.checked && layout && h("span", { class: "pw-cell-where" }, whereText(card)),
          h("span", { class: "pw-cell-name" }, card.name),
          h("span", { class: "pw-cell-meta" }, card.number + " · " + (card.rarity || "")))));
    whereRow.hidden = !(mode !== "full" && layout);
    noteEl.textContent = mode === "full"
      ? "Full card in color at real card size (63 × 88 mm) · 9 per sheet"
      : "Small grayscale image with name, number and rarity · 9 per sheet";
    if (items.length > PER_SHEET) noteEl.textContent += " · preview shows sheet 1 of " + sheetsNeeded(items.length);
  }

  // ── PDF ──
  async function makePdf() {
    const items = chosen();
    if (!items.length) return;
    busy = true; printBtn.disabled = true;
    try {
      printBtn.textContent = "Working…";
      progress.set(null, null, "Starting…");
      const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm");
      progress.set(0, items.length, "Loading images");
      const images = await loadMany(items.map((x) => x.print.image),
        { grayscale: mode !== "full", maxWidth: mode === "full" ? 750 : 400 },
        (done, total) => progress.set(done, total, "Loading images"));
      progress.set(null, null, "Building the PDF…");
      await new Promise((r) => setTimeout(r, 30));      // let the bar redraw first
      const doc = buildPdf(jsPDF, items.map((x, i) => ({
        name: x.card.name, number: x.card.number, rarity: x.card.rarity, dataUrl: images[i] && images[i].dataUrl,
        where: mode !== "full" && showWhere.checked ? whereText(x.card) : "",
      })), { mode, paper: state.settings.paper, cutLines: cut.checked });
      const b = source.type === "binder" && binders.find((x) => x.id === source.id);
      const label = b ? b.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") : source.code;
      download(game + "-" + label + "-" + (mode === "full" ? "cards" : "placeholders") + ".pdf", doc.output("blob"));
      progress.finish("Done — your PDF is downloading");
      const missingImgs = images.filter((x) => !x).length;
      toast(missingImgs ? "PDF ready — " + missingImgs + " image(s) couldn't load and show as boxes" : "PDF ready");
    } catch (err) {
      toast("Couldn't make the PDF: " + explain(err), "err");
    } finally {
      busy = false; printBtn.textContent = "Download PDF"; refreshSide();
      setTimeout(() => progress.hide(), 2500);
    }
  }

  // ── header controls ──
  // set menu (grouped like the collection's) + your binders as one more group
  const prefix = (tree) => tree.map((n) => n.type === "item" ? { ...n, value: "set:" + n.value }
    : { ...n, items: n.items.map((i) => ({ ...i, value: "set:" + i.value })) });
  const tree = prefix(toTree(groupSets(setsWithCards, (state.settings.setGroups || {})[game])));
  if (binders.length) tree.push({ type: "group", key: "__binders", label: "Binders (" + binders.length + ")",
                                  items: binders.map((b) => ({ value: "binder:" + b.id, label: b.name })) });
  const sourcePicker = createSetPicker(tree, { ariaLabel: "Cards from",
    value: source.type === "binder" ? "binder:" + source.id : "set:" + source.code,
    onChange: (v) => {
      const [type, x] = v.split(":");
      source = type === "binder" ? { type, id: Number(x) } : { type, code: x };
      selected.clear(); selectMissing(); drawList(); refreshSide();
    } });
  const sourceSel = sourcePicker.el;

  const seg = (options, value, onPick) => {
    const g = h("div", { class: "segmented", role: "group" });
    for (const [v, t] of options) {
      const b = h("button", { type: "button", class: v === value ? "on" : "", "aria-pressed": String(v === value) }, t);
      b.addEventListener("click", () => { for (const x of g.children) { x.className = ""; x.setAttribute("aria-pressed", "false"); }
        b.className = "on"; b.setAttribute("aria-pressed", "true"); onPick(v); });
      g.append(b);
    }
    return g;
  };

  const meta = GAMES.find((g) => g.id === game);
  const content = h("div", { class: "pw" },
    h("div", { class: "pw-head" },
      h("div", { class: "pw-title" }, h("span", { class: "eyebrow" }, "// " + meta.label), h("h2", { class: "modal-title" }, "Print")),
      h("label", { class: "row muted small" }, "Cards from", sourceSel),
      seg([["full", "Full cards"], ["placeholder", "Placeholders (grayscale)"]], mode, (v) => { mode = v; refreshSide(); }),
      seg([["missing", "Missing"], ["all", "All"]], show, (v) => { show = v; drawList(); }),
      h("button", { class: "btn btn-icon", "aria-label": "Close", onClick: () => close() }, "✕")),
    h("div", { class: "pw-body" },
      h("div", { class: "pw-left" },
        h("div", { class: "row wrap" },
          h("button", { class: "btn btn-accent", onClick: () => { selectMissing(); drawList(); refreshSide(); } }, "Select all missing"),
          h("button", { class: "btn", onClick: () => { selectMissing({ withAlts: true }); drawList(); refreshSide(); } }, "+ all their alt arts"),
          h("button", { class: "btn", onClick: () => { selected.clear(); drawList(); refreshSide(); } }, "Clear")),
        listEl),
      h("div", { class: "pw-right" },
        h("span", { class: "eyebrow" }, "Preview · sheet 1"),
        previewEl, noteEl, whereRow,
        h("label", { class: "row small" }, cut, "Cut lines"))),
    h("div", { class: "pw-foot" }, summaryEl, progress.el, h("span", { class: "spacer" }),
      h("button", { class: "btn", onClick: () => close() }, "Cancel"), printBtn));

  if (Array.isArray(preselect)) preselect.forEach((id) => selected.add(id)); else selectMissing();
  if (Array.isArray(preselect)) { show = "all"; content.querySelectorAll(".segmented")[1].children[1].click(); }
  drawList(); refreshSide();
  const close = openModal(content, { label: "Print" });
  content.closest(".modal").classList.add("modal-wide");
  return { close };
}
