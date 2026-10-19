// ============================================================
//  home.js — first version: each game's progress straight from the
//  database. Stage 6 adds "Almost complete" and "Latest new cards".
// ============================================================
import { h, fmt, pct } from "../ui.js";
import { icon } from "../components/icons.js";
import { GAMES } from "../config.js";
import { link } from "../router.js";
import { state, loadSetProgress, loadLog, loadGame } from "../store.js";
import { cardImage } from "../images.js";
import { openPrintWindow } from "../components/print-window.js";

export function homePage() {
  const extras = h("div", { class: "home-extras" });
  Promise.all([loadSetProgress(), loadLog()]).then(([sets, log]) => drawExtras(extras, sets, log)).catch(() => {});
  const main = homeTop();
  main.append(extras);
  return main;
}

/** "Almost complete" and "Latest new cards" — each only shown when it has something. */
function drawExtras(box, sets, log) {
  const almost = sets.filter((s) => s.cards >= 4 && s.missing > 0)
    .sort((a, b) => a.missing - b.missing || b.collected / b.cards - a.collected / a.cards).slice(0, 6);
  const newest = log.filter((e) => e.action === "New Card" || e.action === "New Alt Art");
  const latestDay = newest[0] && newest[0].at.slice(0, 10);
  const latest = latestDay ? newest.filter((e) => e.at.slice(0, 10) === latestDay) : [];

  box.replaceChildren(
    almost.length ? h("section", { class: "panel home-almost", "aria-label": "Almost complete" },
      h("div", { class: "row" }, h("h2", { class: "section-title" }, "Almost complete"), h("span", { class: "spacer" }),
        h("span", { class: "mono muted" }, "fewest cards missing")),
      almost.map((s) => h("div", { class: "almost-row" },
        icon(s.game, state.settings.accents[s.game], 18),
        h("span", { class: "mono muted almost-code" }, s.set_code),
        h("span", { class: "almost-name" }, s.set_name),
        h("span", { class: "bar thin almost-bar" }, h("span", { style: { width: pct(s.collected, s.cards) + "%", background: state.settings.accents[s.game] } })),
        h("span", { class: "almost-missing" }, s.missing + " missing · " + s.collected + "/" + s.cards),
        h("button", { class: "btn", onClick: () => openPrintWindow({ game: s.game, mode: "full", source: { type: "set", code: s.set_code } }) }, "Print missing")))) : null,
    latest.length ? h("section", { class: "panel home-latest", "aria-label": "Latest new cards" },
      h("div", { class: "row" }, h("h2", { class: "section-title" }, "Latest new cards"), h("span", { class: "spacer" }),
        h("a", { href: link("changelog") }, "Changelog →")),
      h("span", { class: "muted small" }, latestSummary(latest)),
      h("div", { class: "latest-grid" }, latest.slice(0, 6).map((e) => latestCard(e)))) : null);

  // pictures appear once those games are loaded
  for (const g of new Set(latest.map((e) => e.game))) loadGame(g).then(() => {
    const grid = box.querySelector(".latest-grid");
    if (grid) grid.replaceChildren(...latest.slice(0, 6).map((e) => latestCard(e)));
  }).catch(() => {});
}

function latestCard(e) {
  const g = state.games[e.game];
  const print = g && g.prints.find((p) => p.id === e.card_id);
  return h("span", { class: "latest-card" }, cardImage(print || { id: e.card_id, image: "" }, { className: "log-img" }),
    h("span", { class: "mono muted small" }, e.card_id));
}

function latestSummary(entries) {
  const byGame = new Map();
  for (const e of entries) byGame.set(e.game, (byGame.get(e.game) || 0) + 1);
  const day = new Date(entries[0].at).toLocaleDateString("en", { day: "numeric", month: "short" });
  return [...byGame].map(([g, n]) => (GAMES.find((x) => x.id === g) || { label: g }).label + ": " + n + " new").join(" · ") + " · " + day;
}

function homeTop() {
  const rows = state.progress;
  const total = rows.reduce((n, r) => n + r.cards, 0);
  const have = rows.reduce((n, r) => n + r.collected, 0);
  const setsDone = rows.reduce((n, r) => n + r.sets_complete, 0);

  return h("main", { class: "page" },
    h("section", { class: "panel hero" },
      h("div", { class: "stack-tight" },
        h("span", { class: "eyebrow" }, "// whole collection"),
        h("span", { class: "big-number" }, fmt(have), h("span", { class: "big-number-sub" }, " of " + fmt(total) + " cards"))),
      h("div", { class: "hero-bar" },
        h("div", { class: "bar", role: "img", "aria-label": fmt(have) + " of " + fmt(total) + " collected" },
          GAMES.map((g) => {
            const r = rows.find((x) => x.game === g.id);
            return r && r.collected ? h("span", { style: { width: (r.collected / total * 100) + "%", background: state.settings.accents[g.id] } }) : null;
          }))),
      h("div", { class: "stats" },
        stat("Complete", pct(have, total) + "%"),
        stat("Sets done", fmt(setsDone)))),
    h("section", { class: "game-grid", "aria-label": "Games" },
      GAMES.map((g) => {
        const r = rows.find((x) => x.game === g.id) || { cards: 0, collected: 0, sets: 0, sets_complete: 0 };
        const color = state.settings.accents[g.id];
        const p = pct(r.collected, r.cards);
        return h("a", { class: "panel game-card", href: link(g.id), style: { borderColor: color + "55" } },
          h("span", { class: "row" }, icon(g.id, color, 26), h("span", { class: "game-name" }, g.label),
            h("span", { class: "spacer" }), h("span", { class: "game-pct", style: { color } }, p + "%")),
          h("span", { class: "bar thin" }, h("span", { style: { width: p + "%", background: color } })),
          h("span", { class: "row muted small" },
            h("span", {}, fmt(r.collected) + " of " + fmt(r.cards) + " cards"), h("span", { class: "spacer" }),
            h("span", {}, r.sets_complete + " of " + r.sets + " sets complete")));
      })));
}

function stat(label, value) {
  return h("div", { class: "stat" }, h("span", { class: "stat-label" }, label), h("span", { class: "stat-value" }, value));
}
