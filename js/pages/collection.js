// ============================================================
//  collection.js — one game's cards: grid or list, filters,
//  counters, and the prints drawer.
// ============================================================
import { h, fmt, pct, errorBox, toast } from "../ui.js";
import { cardImage } from "../images.js";
import { filterCards, sortCards, shownPrint, basePrint } from "../cards.js";
import { openPrintWindow } from "../components/print-window.js";
import { openDeckList } from "../components/deck-list.js";
import { createDrawer } from "../components/prints-drawer.js";
import { GAMES } from "../config.js";
import { state, loadGame, loadSets, bulkSetOwned, setOwned } from "../store.js";
import { explain } from "../supabase.js";

const BATCH = 120;   // cards drawn at a time; more appear as you scroll

export function collectionPage(game) {
  const meta = GAMES.find((g) => g.id === game);
  const saved = JSON.parse(sessionStorage.getItem("filters:" + game) || "null");
  const filters = saved || { q: "", set: "", rarity: "", owned: "all", view: state.settings.view };
  let data = null, sets = [], sorted = [], visibleList = [], shown = 0;
  const tiles = new Map();              // card number → its tile, for quick updates
  let observer = null;
  let selecting = false;                // select mode
  const picked = new Set();             // selected card numbers

  const root = h("main", { class: "page collection" }, h("p", { class: "muted" }, "Loading " + meta.label + "…"));
  const drawer = createDrawer(game);

  Promise.all([loadGame(game), loadSets(game)])
    .then(([g, s]) => { data = g; sets = s; sorted = sortCards(g.cards, s); build(); })
    .catch((err) => root.replaceChildren(errorBox("Couldn't load " + meta.label + ": " + explain(err), () => location.reload())));

  // ── layout ──
  const statsEl = h("div", { class: "stats" });
  const resultEl = h("span", { class: "mono muted" });
  const listEl = h("div");
  const moreBtn = h("button", { class: "btn more", onClick: () => drawMore() });

  function build() {
    const search = h("input", { class: "input slim", type: "search", placeholder: "Name or number", value: filters.q,
                                "aria-label": "Search cards" });
    let t = null;
    search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { filters.q = search.value; apply(); }, 150); });

    const setSelect = select("Set", [["", "All sets"], ...sets.filter((s) => setHasCards(s.code)).map((s) => [s.code, s.code + " · " + s.name])],
                             filters.set, (v) => { filters.set = v; apply(); });
    const rarities = [...new Set(data.cards.filter((c) => c.visible || state.settings.showHidden).map((c) => c.rarity).filter(Boolean))].sort();
    const raritySelect = select("Rarity", [["", "All rarities"], ...rarities.map((r) => [r, r])],
                                filters.rarity, (v) => { filters.rarity = v; apply(); });

    root.replaceChildren(
      h("div", { class: "page-head" },
        h("div", {},
          h("span", { class: "eyebrow", style: { color: "var(--" + game + ")" } }, "// " + meta.label),
          h("h1", { class: "page-title" }, "Card Collection")),
        statsEl),
      h("div", { class: "toolbar", role: "toolbar", "aria-label": "Filters" },
        search, setSelect, raritySelect,
        segmented("Show", [["all", "All"], ["owned", "Owned"], ["missing", "Missing"]], filters.owned, (v) => { filters.owned = v; apply(); }),
        h("span", { class: "spacer" }),
        resultEl,
        segmented("View", [["grid", "Grid"], ["list", "List"]], filters.view, (v) => { filters.view = v; apply(); })),
      h("div", { class: "actions", role: "toolbar", "aria-label": "Print and export" },
        h("button", { class: "btn", onClick: printFromView }, "Print"),
        h("button", { class: "btn", onClick: () => openDeckList(game, visibleList.filter((c) => !c.collected), meta.label + " — missing cards") }, "Deck list"),
        h("button", { class: "btn", onClick: saveImages }, "Save as images"),
        selectBtn),
      listEl, moreBtn, selectBar, drawer.el);
    apply();
  }

  function setHasCards(code) { return data.cards.some((c) => c.set === code && (c.visible || state.settings.showHidden)); }

  // ── printing / exporting ──
  function printFromView() {
    const code = filters.set || (visibleList[0] && visibleList[0].set);
    openPrintWindow({ game, mode: "full", source: code ? { type: "set", code } : undefined })
      .catch((err) => toast("Couldn't open the print window: " + explain(err), "err"));
  }
  async function saveImages() {
    if (visibleList.length > 500 && !confirm("That's " + fmt(visibleList.length) + " cards (" + Math.ceil(visibleList.length / 50) + " pictures). Continue?")) return;
    const { exportImages } = await import("../lib/export-image.js");
    exportImages(game, visibleList, meta.label + " — " + (filters.set || "all sets")).catch((err) => toast("Couldn't save images: " + explain(err), "err"));
  }

  // ── select mode ──
  const selectBtn = h("button", { class: "btn", "aria-pressed": "false", onClick: () => toggleSelect() }, "Select");
  const pickedCount = h("span", { class: "mono" });
  const adminButtons = h("span", { class: "row" });
  const selectBar = h("div", { class: "select-bar", hidden: true, role: "toolbar", "aria-label": "Selected cards" },
    pickedCount,
    h("button", { class: "btn", onClick: () => { visibleList.forEach((c) => picked.add(c.number)); refreshPicks(); } }, "Select all shown"),
    h("button", { class: "btn", onClick: () => { picked.clear(); refreshPicks(); } }, "Clear"),
    h("button", { class: "btn", onClick: () => openPrintWindow({ game, mode: "full", source: filters.set ? { type: "set", code: filters.set } : { type: "set", code: pickedCards()[0] && pickedCards()[0].set },
                                                                 preselect: pickedCards().map((c) => basePrint(c).id) }).catch((e) => toast(explain(e), "err")) }, "Print"),
    h("button", { class: "btn", onClick: () => openDeckList(game, pickedCards(), meta.label + " — selected cards") }, "Deck list"),
    adminButtons,
    h("button", { class: "btn btn-accent", onClick: () => toggleSelect(false) }, "Done"));

  function pickedCards() { return sorted.filter((c) => picked.has(c.number)); }
  function toggleSelect(on = !selecting) {
    selecting = on; picked.clear();
    selectBtn.setAttribute("aria-pressed", String(on)); selectBtn.className = "btn" + (on ? " btn-active" : "");
    selectBar.hidden = !on;
    adminButtons.replaceChildren(...(state.isAdmin ? [
      h("button", { class: "btn", onClick: () => bulk(true) }, "Mark owned"),
      h("button", { class: "btn", onClick: () => bulk(false) }, "Mark not owned")] : []));
    refreshPicks(); update();
  }
  function refreshPicks() {
    pickedCount.textContent = fmt(picked.size) + " selected";
    for (const [number, el] of tiles) { el.classList.toggle("picked", picked.has(number)); }
  }
  async function bulk(owned) {
    const cards = pickedCards();
    if (!cards.length) return;
    // Marking owned uses each card's base print; un-marking clears every print of the card.
    const ids = owned ? cards.map((c) => basePrint(c).id) : cards.flatMap((c) => c.prints.filter((p) => p.owned).map((p) => p.id));
    if (!confirm((owned ? "Mark " : "Un-mark ") + cards.length + " cards as " + (owned ? "owned" : "not owned") + "? A restore point is saved first.")) return;
    try {
      const res = await bulkSetOwned(game, ids, owned);
      data = state.games[game]; sorted = sortCards(data.cards, sets);
      toast((res && res.changed != null ? res.changed : cards.length) + " cards updated");
      picked.clear(); apply();
    } catch (err) { toast("Not saved: " + explain(err), "err"); }
  }

  // ── filtering + drawing ──
  function apply() {
    sessionStorage.setItem("filters:" + game, JSON.stringify(filters));
    const { list, scope } = filterCards(sorted, filters, { showHidden: state.settings.showHidden });
    visibleList = list;
    drawStats(scope);
    resultEl.textContent = fmt(list.length) + " cards";
    tiles.clear();
    shown = 0;
    listEl.replaceChildren(filters.view === "list" ? tableShell() : h("div", { class: "card-grid" }));
    if (!list.length) listEl.replaceChildren(h("p", { class: "empty" }, "No cards match these filters."));
    drawMore();
    watchScroll();
    refreshPicks();
  }

  function drawMore() {
    const next = visibleList.slice(shown, shown + BATCH);
    const target = filters.view === "list" ? listEl.querySelector("tbody") : listEl.querySelector(".card-grid");
    if (target) for (const c of next) { const el = filters.view === "list" ? row(c) : tile(c); if (picked.has(c.number)) el.classList.add("picked"); tiles.set(c.number, el); target.append(el); }
    shown += next.length;
    const left = visibleList.length - shown;
    moreBtn.hidden = left <= 0;
    moreBtn.textContent = "Show more (" + fmt(left) + " left)";
  }

  function watchScroll() {
    if (observer) observer.disconnect();
    if (typeof IntersectionObserver === "undefined") return;           // the button still works
    observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting) && !moreBtn.hidden) drawMore(); },
                                        { rootMargin: "600px" });
    observer.observe(moreBtn);
  }

  function drawStats(scope) {
    const have = scope.filter((c) => c.collected).length;
    statsEl.replaceChildren(stat("Cards", fmt(scope.length)), stat("Collected", fmt(have)),
                            stat("Missing", fmt(scope.length - have)), stat("Complete", pct(have, scope.length) + "%"));
  }

  // ── a card in the grid ──
  function tile(c) {
    const extra = c.prints.length - 1;
    return h("button", { class: "tile" + (c.collected ? " owned" : " missing"), "data-number": c.number,
                         "aria-label": c.number + " " + c.name + (c.collected ? ", collected" : ", missing"),
                         onClick: () => (selecting ? togglePick(c) : drawer.open(c)) },
      h("span", { class: "tile-img-wrap" },
        cardImage(shownPrint(c), { className: "tile-img" }),
        c.collected && h("span", { class: "tile-check", "aria-hidden": "true" }, "✓"),
        extra > 0 && h("span", { class: "tile-arts" }, "+" + extra + (extra === 1 ? " art" : " arts"))),
      h("span", { class: "mono muted" }, c.number + " · " + (c.rarity || "—")),
      h("span", { class: "tile-name" }, c.name));
  }

  async function quickBase(c) {
    const base = basePrint(c);
    const addingWhileOwned = !base.owned && c.collected;
    try {
      await setOwned(game, base.id, !base.owned);
      if (addingWhileOwned) toast("Base art added — you also own another art of " + c.number);
    } catch (err) { toast("Not saved: " + explain(err), "err"); }
  }

  function togglePick(c) { if (picked.has(c.number)) picked.delete(c.number); else picked.add(c.number); refreshPicks(); }

  // ── a card in the list (layout D) ──
  function tableShell() {
    return h("div", { class: "table-wrap" }, h("table", { class: "card-table" },
      h("thead", {}, h("tr", {}, ["Have", "Number", "Name", "Rarity", "Prints owned", "Set"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody")));
  }
  function row(c) {
    const owned = c.prints.filter((p) => p.owned).length;
    // The dot: filled when you own ANY print. Clicking it (signed in) marks / unmarks the BASE art only.
    const dot = state.isAdmin && !selecting
      ? h("button", { class: "dot-btn", "aria-label": (c.collected ? "Collected" : "Missing") + " — click to " + (basePrint(c).owned ? "unmark" : "mark") + " the base art of " + c.number,
                      onClick: (e) => { e.stopPropagation(); quickBase(c); } }, h("span", { class: "dot" + (c.collected ? " on" : "") }))
      : h("span", { class: "dot" + (c.collected ? " on" : ""), role: "img", "aria-label": c.collected ? "collected" : "missing" });
    const tr = h("tr", { class: c.collected ? "owned" : "missing", "data-number": c.number, tabindex: "0" },
      h("td", {}, dot),
      h("td", { class: "mono" }, c.number),
      h("td", { class: "strong" }, c.name),
      h("td", {}, c.rarity || "—"),
      h("td", { class: "mono muted" }, owned + " / " + c.prints.length),
      h("td", { class: "muted" }, c.set));
    tr.addEventListener("click", () => (selecting ? togglePick(c) : drawer.open(c)));
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter") (selecting ? togglePick(c) : drawer.open(c)); });
    return tr;
  }

  // Called when something changes (e.g. you ticked a print): redraw only what's affected.
  function update() {
    if (!data) return;
    if (selecting) adminButtons.replaceChildren(...(state.isAdmin ? [
      h("button", { class: "btn", onClick: () => bulk(true) }, "Mark owned"),
      h("button", { class: "btn", onClick: () => bulk(false) }, "Mark not owned")] : []));
    const latest = state.games[game];
    if (latest && latest !== data) {                       // new cards arrived: redraw once
      data = latest; sorted = sortCards(data.cards, sets); latest.replaced = false;
      apply(); drawer.refresh(); return;
    }
    const { scope } = filterCards(sorted, filters, { showHidden: state.settings.showHidden });
    drawStats(scope);
    for (const [number, el] of tiles) {
      const c = data.byNumber.get(number);
      el.replaceWith(filters.view === "list" ? row(c) : tile(c));
    }
    for (const el of listEl.querySelectorAll("[data-number]")) tiles.set(el.getAttribute("data-number"), el);
    refreshPicks();
    drawer.refresh();
  }

  // keepOnAuth: this page handles signing in / out itself (checkboxes and dots lock or unlock)
  return { el: root, update, keepOnAuth: true, destroy: () => { observer && observer.disconnect(); } };
}

// ── small controls ──
function select(label, options, value, onChange) {
  const sel = h("select", { class: "input slim", "aria-label": label },
    options.map(([v, text]) => h("option", { value: v, selected: v === value }, text)));
  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}

function segmented(label, options, value, onChange) {
  const group = h("div", { class: "segmented", role: "group", "aria-label": label });
  for (const [v, text] of options) {
    const b = h("button", { type: "button", "aria-pressed": String(v === value), class: v === value ? "on" : "" }, text);
    b.addEventListener("click", () => {
      for (const x of group.children) { x.className = ""; x.setAttribute("aria-pressed", "false"); }
      b.className = "on"; b.setAttribute("aria-pressed", "true");
      onChange(v);
    });
    group.append(b);
  }
  return group;
}

function stat(label, value) {
  return h("div", { class: "stat" }, h("span", { class: "stat-label" }, label), h("span", { class: "stat-value" }, value));
}
