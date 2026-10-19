// ============================================================
//  binders.js — the binder view: your binders as chips, a summary,
//  the two-page spread (2 × 2 pockets) and the page strip.
// ============================================================
import { h, fmt, pct, errorBox, toast } from "../ui.js";
import { cardImage } from "../images.js";
import { sortCards, shownPrint } from "../cards.js";
import { layoutBinder, displayOrder, spreads, spreadOfPage } from "../lib/binder-layout.js";
import { createDrawer } from "../components/prints-drawer.js";
import { openPrintWindow } from "../components/print-window.js";
import { GAMES } from "../config.js";
import { link, go } from "../router.js";
import { state, loadGame, loadSets, loadBinders, moveBinder } from "../store.js";
import { explain } from "../supabase.js";

export const SET_COLORS = ["#60a5fa", "#a78bfa", "#f59e0b", "#34d399", "#f472b6", "#f87171", "#22d3ee", "#a3e635"];

/** setCode → visible cards in release order, for laying out binders. */
export function cardsBySetFor(game, sets) {
  const map = new Map();
  for (const c of sortCards(state.games[game].cards, sets)) {
    if (!c.visible) continue;
    if (!map.has(c.set)) map.set(c.set, []);
    map.get(c.set).push(c);
  }
  return map;
}

export function binderPage(game, id) {
  const meta = GAMES.find((g) => g.id === game);
  const root = h("main", { class: "page binders" }, h("p", { class: "muted" }, "Loading binders…"));
  const drawer = createDrawer(game);
  let sets = [], binder = null, layout = null, spread = 0, chipsEl = null;

  Promise.all([loadGame(game), loadSets(game), loadBinders(game)])
    .then(([, s]) => { sets = s; draw(); })
    .catch((err) => root.replaceChildren(errorBox("Couldn't load binders: " + explain(err), () => location.reload())));

  function draw() {
    const binders = state.binders[game] || [];
    if (!id && binders.length) { go(game + "/binders/" + binders[0].id); return; }
    binder = binders.find((b) => b.id === id) || null;
    if (!binder) {
      root.replaceChildren(chips(binders), h("section", { class: "panel empty-binders" },
        h("h1", { class: "page-title" }, binders.length ? "Binder not found" : "No " + meta.label + " binders yet"),
        h("p", { class: "muted" }, state.isAdmin ? "Create one to lay out your sets the way your real binder is." : "The collection's owner hasn't set up binders for this game yet."),
        state.isAdmin && h("a", { class: "btn btn-primary", href: link(game + "/binders/new") }, "+ New binder")));
      return;
    }
    layout = layoutBinder(binder, cardsBySetFor(game, sets));
    const saved = Number(sessionStorage.getItem("spread:" + binder.id));
    spread = Number.isFinite(saved) ? Math.min(saved, totalSpreads() - 1) : 0;
    chipsEl = chips(binders);
    root.replaceChildren(chipsEl, summary(), navEl, spreadEl, stripEl, drawer.el);
    drawSpread();
  }

  // ── chips: all binders of this game ──
  function chips(binders) {
    const mover = (b, i, dir) => h("button", { class: "btn btn-icon chip-move", disabled: i + dir < 0 || i + dir >= binders.length,
      "aria-label": "Move " + b.name + (dir < 0 ? " left" : " right"),
      onClick: () => moveBinder(game, b.id, dir).catch((e) => toast("Not saved: " + explain(e), "err")) }, dir < 0 ? "◀" : "▶");
    return h("div", { class: "row wrap binder-chips" },
      binders.map((b, i) => {
        const L = layoutBinder(b, cardsBySetFor(game, sets));
        const all = [...L.where.keys()].map((n) => state.games[game].byNumber.get(n));
        const chip = h("a", { class: "chip" + (b.id === id ? " active" : ""), href: link(game + "/binders/" + b.id),
                        "aria-current": b.id === id ? "page" : null },
          b.name, h("span", { class: "mono muted" }, pct(all.filter((c) => c.collected).length, all.length) + "%"));
        // signed in: arrows on the open binder to change the order
        return state.isAdmin && b.id === id && binders.length > 1
          ? h("span", { class: "chip-group" }, mover(b, i, -1), chip, mover(b, i, 1)) : chip;
      }),
      state.isAdmin && h("a", { class: "chip chip-new", href: link(game + "/binders/new") }, "+ New binder"));
  }

  // ── summary ──
  function summary() {
    const cards = [...layout.where.keys()].map((n) => state.games[game].byNumber.get(n));
    const have = cards.filter((c) => c.collected).length;
    const setNames = binder.sets.map((s) => { const x = sets.find((y) => y.code === s.code); return x ? x.code + " " + x.name : s.code; });
    return h("section", { class: "panel binder-summary" },
      h("div", { class: "stack-tight" },
        h("span", { class: "eyebrow", style: { color: "var(--" + game + ")" } },
          "// Binder · 2 × 2 pockets · " + (binder.reading_order === "ltr" ? "left → right" : "right → left")),
        h("h1", { class: "page-title" }, binder.name),
        h("span", { class: "muted" }, setNames.join(" · ") || "No sets yet")),
      h("span", { class: "spacer" }),
      h("div", { class: "stats" },
        stat("Collected", fmt(have) + " / " + fmt(cards.length)),
        stat("Complete", pct(have, cards.length) + "%"),
        stat("Pages", layout.used + " / " + layout.capacity, !layout.fits)),
      h("div", { class: "row wrap" },
        state.isAdmin && h("a", { class: "btn", href: link(game + "/binders/" + binder.id + "/edit") }, "Edit binder"),
        h("button", { class: "btn btn-accent", onClick: () => openPrintWindow({ game, mode: "placeholder", source: { type: "binder", id: binder.id } })
          .catch((e) => toast(explain(e), "err")) }, "Print missing")),
      !layout.fits && h("p", { class: "warn" }, "These sets need " + layout.used + " pages but the binder has " + layout.capacity + "."));
  }

  // ── spread + navigation ──
  const spreadEl = h("div", { class: "spread-wrap" });
  const stripEl = h("section", { class: "strip", "aria-label": "Pages" });
  const navLabel = h("span", { class: "mono muted" });
  const counter = h("span", { class: "mono" });
  const prevBtn = h("button", { class: "btn btn-icon", "aria-label": "Previous pages", onClick: () => flip(-1) }, "‹");
  const nextBtn = h("button", { class: "btn btn-icon", "aria-label": "Next pages", onClick: () => flip(1) }, "›");
  const navEl = h("div", { class: "spread-nav" }, navLabel, h("div", { class: "row" }, prevBtn, counter, nextBtn));
  spreadEl.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") flip(-1); if (e.key === "ArrowRight") flip(1); });

  const pageCount = () => Math.max(layout.used, layout.capacity);
  const totalSpreads = () => spreads(pageCount()).length;
  function flip(d) { goSpread(spread + d); }
  function goSpread(n) {
    spread = Math.max(0, Math.min(totalSpreads() - 1, n));
    sessionStorage.setItem("spread:" + binder.id, String(spread));
    drawSpread();
  }

  function drawSpread() {
    const [left, right] = spreads(pageCount())[spread];
    const numbers = [left, right].filter(Boolean).flatMap((n) => (layout.pages[n - 1] ? layout.pages[n - 1].pockets : []))
      .filter((s) => s.card).map((s) => s.card.number);
    navLabel.textContent = (left ? "Pages " + left + (right ? " & " + right : "") : "Inside cover & page 1")
      + (numbers.length ? " · " + numbers[0] + " – " + numbers[numbers.length - 1] : "");
    counter.textContent = "Spread " + (spread + 1) + " / " + totalSpreads();
    prevBtn.disabled = spread === 0; nextBtn.disabled = spread >= totalSpreads() - 1;
    spreadEl.replaceChildren(h("div", { class: "spread", tabindex: "0", role: "group", "aria-label": navLabel.textContent },
      pageEl(left, "left"), h("div", { class: "spine" }), pageEl(right, "right")));
    drawStrip();
  }

  function pageEl(n, side) {
    if (n === null) return h("div", { class: "bpage cover " + side }, h("span", { class: "muted" }, side === "left" ? "Inside cover" : ""));
    const page = layout.pages[n - 1];
    if (!page) return h("div", { class: "bpage " + side + " unused-page" }, h("span", { class: "muted" }, "Page " + n + " · not used yet"));
    if (page.kind === "empty") return h("div", { class: "bpage " + side + " empty-page" }, h("span", { class: "muted" }, "Page " + n + " · empty page"));
    return h("div", { class: "bpage " + side },
      displayOrder(page.pockets, binder.reading_order).map((slot) => pocketEl(slot)),
      h("span", { class: "page-no" }, String(n)));
  }

  function pocketEl(slot) {
    if (slot.blank) return h("div", { class: "pocket blank" }, h("span", { class: "muted small" }, "Empty pocket"));
    if (slot.unused) return h("div", { class: "pocket unused" });
    const c = slot.card;
    return h("button", { class: "pocket" + (c.collected ? "" : " missing"), onClick: () => drawer.open(c),
                         "aria-label": c.number + " " + c.name + (c.collected ? ", collected" : ", missing") },
      cardImage(shownPrint(c), { className: "pocket-img" }),
      h("span", { class: "pocket-name" }, c.name),
      h("span", { class: "pocket-meta" }, c.number + " · " + (c.rarity || "—")));
  }

  // ── page strip: every page with its 4 pockets ──
  function drawStrip() {
    const [l, r] = spreads(pageCount())[spread];
    const colorOf = new Map(binder.sets.map((s, i) => [s.code, SET_COLORS[i % SET_COLORS.length]]));
    const blocks = [];
    for (let n = 1; n <= pageCount(); n++) {
      const page = layout.pages[n - 1];
      const here = n === l || n === r;
      const color = page && page.set ? colorOf.get(page.set) : null;
      const label = "Page " + n + (!page ? ", not used yet" : page.kind === "empty" ? ", empty page"
        : ", " + page.pockets.filter((s) => s.card && s.card.collected).length + " of " + page.pockets.filter((s) => s.card).length + " collected");
      const minis = page && page.kind === "cards" ? displayOrder(page.pockets, binder.reading_order).map((s) =>
        h("span", { class: "mini " + (s.card ? (s.card.collected ? "own" : "miss") : "none"), style: s.card && s.card.collected ? { background: color } : null })) : [];
      blocks.push(h("button", { class: "pblock" + (!page ? " unused" : page.kind === "empty" ? " empty" : "") + (here ? " here" : ""),
                                style: color ? { borderColor: color } : null, "aria-label": label, title: label,
                                onClick: () => goSpread(spreadOfPage(n)) }, minis));
    }
    stripEl.replaceChildren(
      h("div", { class: "row wrap strip-head" },
        h("span", { class: "eyebrow" }, "Pages · " + layout.used + " of " + layout.capacity + " used"),
        h("span", { class: "spacer" }),
        binder.sets.map((s, i) => legend(SET_COLORS[i % SET_COLORS.length], s.code)),
        legend(null, "Missing", "miss"), legend(null, "Unused pocket", "none"),
        layout.pages.some((p) => p.kind === "empty") && legend(null, "Empty page", "hatch")),
      h("div", { class: "pblocks" }, blocks));
  }

  function legend(color, text, cls) {
    return h("span", { class: "legend" }, h("span", { class: "legend-dot" + (cls ? " " + cls : ""), style: color ? { background: color } : null }), text);
  }

  // Ticked a print in the drawer, or new data arrived: refresh without losing your place.
  let wasAdmin = state.isAdmin;
  function update() {
    if (state.isAdmin !== wasAdmin) { wasAdmin = state.isAdmin; return draw(); }   // edit buttons appear / disappear
    if (!binder) return draw();
    const binders = state.binders[game] || [];
    binder = binders.find((b) => b.id === id) || binder;          // the latest copy (e.g. after reordering)
    if (chipsEl) { const fresh = chips(binders); chipsEl.replaceWith(fresh); chipsEl = fresh; }
    layout = layoutBinder(binder, cardsBySetFor(game, sets));
    const old = root.querySelector(".binder-summary");
    if (old) old.replaceWith(summary());
    drawSpread(); drawer.refresh();
  }

  return { el: root, update, keepOnAuth: true };
}

function stat(label, value, bad) {
  return h("div", { class: "stat" + (bad ? " bad" : "") }, h("span", { class: "stat-label" }, label), h("span", { class: "stat-value" }, value));
}
