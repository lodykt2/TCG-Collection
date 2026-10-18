// ============================================================
//  home.js — first version: each game's progress straight from the
//  database. Stage 6 adds "Almost complete" and "Latest new cards".
// ============================================================
import { h, fmt, pct } from "../ui.js";
import { icon } from "../components/icons.js";
import { GAMES } from "../config.js";
import { link } from "../router.js";
import { state } from "../store.js";

export function homePage() {
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
