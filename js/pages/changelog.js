// ============================================================
//  changelog.js — three sections (New cards, Removed cards, Newly
//  owned), each made of collapsible panels per day and game.
//  Sections with nothing in them aren't shown.
// ============================================================
import { h, fmt, errorBox } from "../ui.js";
import { cardImage } from "../images.js";
import { icon } from "../components/icons.js";
import { GAMES } from "../config.js";
import { state, loadLog, loadGame, pendingCount } from "../store.js";
import { link } from "../router.js";
import { explain } from "../supabase.js";

const SECTIONS = [
  { id: "new",     label: "New cards",     hint: "added to the dashboard",     color: "#aed581", actions: ["New Card", "New Alt Art", "New Set", "Baseline"] },
  { id: "removed", label: "Removed cards", hint: "and why they were removed",  color: "#f87171", actions: ["Removed", "Excluded"] },
  { id: "owned",   label: "Newly owned",   hint: "cards you marked as owned",  color: "#60a5fa", actions: ["Owned", "Merge"] },
];
const SCHEDULE = [["Mon 06:00", "Digimon (recent sets)"], ["Tue 06:00", "Gundam"], ["Wed 06:00", "Palworld"], ["1st of the month", "Digimon full check"]];
const PREVIEW = 18;                     // cards shown per panel before "Show all"

export function changelogPage() {
  const root = h("main", { class: "page changelog" }, h("p", { class: "muted" }, "Loading the changelog…"));
  let log = [], section = sessionStorage.getItem("log:section") || "new", game = sessionStorage.getItem("log:game") || "";
  const open = new Set(JSON.parse(sessionStorage.getItem("log:open") || "null") || []);
  const autoOpened = new Set();          // each section opens its newest panel the first time you see it
  let waiting = 0;

  Promise.all([loadLog(), pendingCount()])
    .then(([l, p]) => { log = l; waiting = p; draw(); })
    .catch((err) => root.replaceChildren(errorBox("Couldn't load the changelog: " + explain(err), () => location.reload())));

  function groups() {
    const out = new Map();
    for (const e of log) {
      if (game && e.game !== game) continue;
      const sec = SECTIONS.find((s) => s.actions.includes(e.action));
      if (!sec) continue;
      const day = localDay(e.at);
      const key = sec.id + "|" + day + "|" + e.game;
      if (!out.has(key)) out.set(key, { key, section: sec.id, day, at: e.at, game: e.game, entries: [] });
      out.get(key).entries.push(e);
    }
    return [...out.values()];
  }

  function draw() {
    const all = groups();
    const present = SECTIONS.filter((s) => all.some((g) => g.section === s.id));
    if (!present.some((s) => s.id === section)) section = present[0] ? present[0].id : "new";
    const panels = all.filter((g) => g.section === section);
    const view = section + "|" + game;
    if (!autoOpened.has(view)) {
      autoOpened.add(view);
      if (panels[0] && !panels.some((p) => open.has(p.key))) open.add(panels[0].key);
    }

    root.replaceChildren(
      h("div", { class: "page-head" },
        h("h1", { class: "page-title" }, "Changelog"),
        h("div", { class: "row wrap", role: "group", "aria-label": "Game" },
          [["", "All games"], ...GAMES.map((g) => [g.id, g.label])].map(([id, label]) =>
            h("button", { class: "chip-btn" + (game === id ? " on" : ""), "aria-pressed": String(game === id),
                          onClick: () => { game = id; sessionStorage.setItem("log:game", id); draw(); } }, label)))),
      h("div", { class: "log-cols" },
        h("div", { class: "log-main" },
          present.length
            ? h("div", { class: "log-tabs", role: "tablist", style: { gridTemplateColumns: "repeat(" + present.length + ", minmax(0, 1fr))" } },
                present.map((s) => h("button", { role: "tab", "aria-selected": String(section === s.id), class: "log-tab" + (section === s.id ? " on" : ""),
                                                 style: section === s.id ? { borderColor: s.color, boxShadow: "inset 0 -3px 0 " + s.color } : null,
                                                 onClick: () => { section = s.id; sessionStorage.setItem("log:section", s.id); draw(); } },
                  h("span", { class: "log-tab-label" }, s.label), h("span", { class: "muted small" }, s.hint))))
            : h("p", { class: "empty" }, "Nothing has changed yet."),
          h("div", { class: "stack" }, panels.map(panel))),
        side()));
  }

  function panel(g) {
    const isOpen = open.has(g.key);
    const sec = SECTIONS.find((s) => s.id === g.section);
    const box = h("section", { class: "log-panel" + (isOpen ? " open" : ""), style: isOpen ? { borderColor: sec.color + "66" } : null });
    const head = h("button", { class: "log-panel-head", "aria-expanded": String(isOpen), onClick: () => {
        if (open.has(g.key)) open.delete(g.key); else open.add(g.key);
        sessionStorage.setItem("log:open", JSON.stringify([...open])); draw(); } },
      h("span", { class: "mono muted log-date" }, shortDay(g.day)),
      icon(g.game, state.settings.accents[g.game] || "#999", 20),
      h("span", { class: "log-title" }, gameLabel(g.game) + " · " + title(g)),
      h("span", { class: "spacer" }),
      h("span", { "aria-hidden": "true", class: "muted" }, isOpen ? "▴" : "▾"));
    box.append(head);
    if (isOpen) box.append(body(g));
    return box;
  }

  function body(g) {
    const wrap = h("div", { class: "log-body" });
    const cardEntries = g.entries.filter((e) => e.card_id);
    const lines = g.entries.filter((e) => !e.card_id || e.action === "New Set");
    const shown = cardEntries.filter((e) => e.action !== "New Set");
    if (shown.length) {
      const grid = h("div", { class: "log-grid" });
      const more = h("button", { class: "btn more", hidden: shown.length <= PREVIEW }, "Show all " + fmt(shown.length));
      const fill = (n) => { grid.replaceChildren(...shown.slice(0, n).map((e) => logCard(g.game, e))); };
      more.addEventListener("click", () => { fill(shown.length); more.hidden = true; });
      fill(PREVIEW);
      wrap.append(grid, more);
      loadGame(g.game).then(() => fill(more.hidden ? shown.length : PREVIEW)).catch(() => {});   // images once the game is loaded
    }
    for (const e of lines) wrap.append(h("div", { class: "log-line" },
      h("span", { class: "strong" }, e.action === "New Set" ? "New set " + e.set_code : e.action === "Merge" ? "Carried over" : e.action),
      h("span", { class: "muted" }, e.details)));
    return wrap;
  }

  function logCard(game, e) {
    const print = state.games[game] && state.games[game].prints.find((p) => p.id === e.card_id);
    // the log entry itself says which print it was ("… · Promo"), so the label is right even before the cards load
    const fromLog = (e.details || "").split(" · ").pop();
    const tag = e.action === "Removed" || e.action === "Excluded" ? "Removed"
              : print ? print.variant
              : e.action === "New Alt Art" ? (/(Alt Art|Parallel|Promo)/.test(fromLog) ? fromLog : "Alt art") : "";
    const why = (e.action === "Removed" || e.action === "Excluded") ? reason(e) : "";
    const hidden = /· hidden/.test(e.details || "") || (print && print.hidden);
    return h("a", { class: "log-card", href: print ? link(game) : null },
      h("span", { class: "log-card-img" }, cardImage(print || { id: e.card_id, image: "" }, { className: "log-img" }),
        tag && h("span", { class: "tile-arts" }, tag)),
      h("span", { class: "mono muted small" }, e.card_id + (hidden ? " · hidden" : "")),
      h("span", { class: "tile-name" }, print ? print.name : (e.details || "").split(" · ")[0]),
      why && h("span", { class: "small bad-text" }, why));
  }

  function side() {
    const since = Date.now() - 30 * 86400000;
    const recent = GAMES.map((g) => {
      const es = log.filter((e) => e.game === g.id && new Date(e.at).getTime() >= since);
      const cards = es.filter((e) => e.action === "New Card").length, alts = es.filter((e) => e.action === "New Alt Art").length;
      return { g, cards, alts };
    }).filter((x) => x.cards || x.alts);
    return h("aside", { class: "log-side" },
      recent.length && h("section", { class: "panel stack-tight" }, h("span", { class: "eyebrow" }, "Last 30 days"),
        recent.map((x) => h("div", { class: "row" }, h("span", {}, x.g.label), h("span", { class: "spacer" }),
          h("span", { class: "mono" }, [x.cards && fmt(x.cards) + (x.cards === 1 ? " card" : " cards"),
                                        x.alts && fmt(x.alts) + (x.alts === 1 ? " alt art" : " alt arts")].filter(Boolean).join(" · "))))),
      h("section", { class: "panel stack-tight" }, h("span", { class: "eyebrow" }, "Next checks (UTC)"),
        SCHEDULE.map(([when, what]) => h("span", { class: "small" }, h("span", { class: "mono muted" }, when + " · "), what))),
      waiting > 0 && h("a", { class: "panel waiting", href: link("admin") },
        h("span", {}, h("span", { class: "strong" }, "Waiting for your approval"), h("br"), h("span", { class: "muted small" }, "visible only to you")),
        h("span", { class: "big-number" }, String(waiting))));
  }

  return { el: root, update() {} };
}

// ── wording ──
function title(g) {
  const n = (a) => g.entries.filter((e) => e.action === a).length;
  const plural = (k, one, many) => fmt(k) + " " + (k === 1 ? one : many);
  if (g.section === "new") {
    const base = n("Baseline");
    if (base && !n("New Card") && !n("New Alt Art")) return "collection rebuilt";
    return [n("New Card") && plural(n("New Card"), "new card", "new cards"),
            n("New Alt Art") && plural(n("New Alt Art"), "new alt art", "new alt arts"),
            n("New Set") && plural(n("New Set"), "new set", "new sets")].filter(Boolean).join(", ");
  }
  if (g.section === "removed") return plural(n("Removed") + n("Excluded"), "card removed", "cards removed");
  const owned = n("Owned"), merged = g.entries.filter((e) => e.action === "Merge");
  if (merged.length && !owned) return "carried over from the old sheet";
  return plural(owned, "newly owned", "newly owned");
}
function reason(e) {
  if (e.action === "Excluded") return "Why: excluded by your override";
  if (/no longer on any source/.test(e.details || "")) return "Why: no longer listed by the source — you approved the removal";
  return "Why: " + (e.details || "removed");
}
const gameLabel = (id) => (GAMES.find((g) => g.id === id) || { label: id }).label;
function localDay(iso) { const d = new Date(iso); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function shortDay(day) { const [y, m, d] = day.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en", { day: "numeric", month: "short" }); }
