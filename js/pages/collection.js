// ============================================================
//  collection.js — one game's cards: grid or list, filters,
//  counters, and the prints drawer.
// ============================================================
import { h, fmt, pct, errorBox } from "../ui.js";
import { cardImage } from "../images.js";
import { filterCards, sortCards, shownPrint } from "../cards.js";
import { createDrawer } from "../components/prints-drawer.js";
import { GAMES } from "../config.js";
import { state, loadGame, loadSets } from "../store.js";
import { explain } from "../supabase.js";

const BATCH = 120;   // cards drawn at a time; more appear as you scroll

export function collectionPage(game) {
  const meta = GAMES.find((g) => g.id === game);
  const saved = JSON.parse(sessionStorage.getItem("filters:" + game) || "null");
  const filters = saved || { q: "", set: "", rarity: "", owned: "all", view: state.settings.view };
  let data = null, sets = [], sorted = [], visibleList = [], shown = 0;
  const tiles = new Map();              // card number → its tile, for quick updates
  let observer = null;

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
      listEl, moreBtn, drawer.el);
    apply();
  }

  function setHasCards(code) { return data.cards.some((c) => c.set === code && (c.visible || state.settings.showHidden)); }

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
  }

  function drawMore() {
    const next = visibleList.slice(shown, shown + BATCH);
    const target = filters.view === "list" ? listEl.querySelector("tbody") : listEl.querySelector(".card-grid");
    if (target) for (const c of next) { const el = filters.view === "list" ? row(c) : tile(c); tiles.set(c.number, el); target.append(el); }
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
                         onClick: () => drawer.open(c) },
      h("span", { class: "tile-img-wrap" },
        cardImage(shownPrint(c), { className: "tile-img" }),
        c.collected && h("span", { class: "tile-check", "aria-hidden": "true" }, "✓"),
        extra > 0 && h("span", { class: "tile-arts" }, "+" + extra + (extra === 1 ? " art" : " arts"))),
      h("span", { class: "mono muted" }, c.number + " · " + (c.rarity || "—")),
      h("span", { class: "tile-name" }, c.name));
  }

  // ── a card in the list (layout D) ──
  function tableShell() {
    return h("div", { class: "table-wrap" }, h("table", { class: "card-table" },
      h("thead", {}, h("tr", {}, ["Have", "Number", "Name", "Rarity", "Prints owned", "Set"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody")));
  }
  function row(c) {
    const owned = c.prints.filter((p) => p.owned).length;
    const tr = h("tr", { class: c.collected ? "owned" : "missing", "data-number": c.number, tabindex: "0" },
      h("td", {}, h("span", { class: "dot" + (c.collected ? " on" : ""), role: "img", "aria-label": c.collected ? "collected" : "missing" })),
      h("td", { class: "mono" }, c.number),
      h("td", { class: "strong" }, c.name),
      h("td", {}, c.rarity || "—"),
      h("td", { class: "mono muted" }, owned + " / " + c.prints.length),
      h("td", { class: "muted" }, c.set));
    tr.addEventListener("click", () => drawer.open(c));
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter") drawer.open(c); });
    return tr;
  }

  // Called when something changes (e.g. you ticked a print): redraw only what's affected.
  function update() {
    if (!data) return;
    const { scope } = filterCards(sorted, filters, { showHidden: state.settings.showHidden });
    drawStats(scope);
    for (const [number, el] of tiles) {
      const c = data.byNumber.get(number);
      el.replaceWith(filters.view === "list" ? row(c) : tile(c));
    }
    for (const el of listEl.querySelectorAll("[data-number]")) tiles.set(el.getAttribute("data-number"), el);
    drawer.refresh();
  }

  return { el: root, update, destroy: () => { observer && observer.disconnect(); } };
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
