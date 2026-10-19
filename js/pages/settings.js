// ============================================================
//  settings.js — only for you. Every change saves straight away
//  to your account, so it applies on any device.
// ============================================================
import { h, toast } from "../ui.js";
import { GAMES, DEFAULT_SETTINGS } from "../config.js";
import { state, saveSettings, signOut, loadGame } from "../store.js";
import { openNewPassword } from "../components/signin.js";
import { download } from "../lib/image-data.js";
import { explain } from "../supabase.js";

const SWATCHES = ["#3b82f6", "#06b6d4", "#a855f7", "#f97316", "#7cb342", "#ef4444", "#60a5fa", "#22d3ee", "#aed581"];

export function settingsPage() {
  const root = h("main", { class: "page narrow-wide settings" });

  async function set(changes, message = "Saved") {
    try { await saveSettings(changes); toast(message); }
    catch (err) { toast("Not saved: " + explain(err), "err"); }
  }

  function draw() {
    const s = state.settings;
    const email = state.session && state.session.user && state.session.user.email;
    root.replaceChildren(
      h("div", { class: "page-head" }, h("h1", { class: "page-title" }, "Settings"),
        h("span", { class: "mono muted" }, "saved to your account · works on any device")),

      h("section", { class: "panel row wrap" },
        h("div", { class: "grow stack-tight" }, h("span", { class: "eyebrow" }, "Account"), h("span", { class: "strong" }, email || ""),
          h("span", { class: "muted small" }, "The only account that can change your collection")),
        h("button", { class: "btn", onClick: () => openNewPassword() }, "Change password"),
        h("button", { class: "btn btn-danger", onClick: () => signOut().then(() => { location.hash = "#/"; }) }, "Sign out")),

      group("Appearance",
        row("Theme", null, seg([["dark", "Dark"], ["light", "Light"], ["system", "Match my computer"]], s.theme, (v) => set({ theme: v }))),
        GAMES.map((g) => row(g.label + " color", null, swatches(g.id, s.accents[g.id] || g.color)))),

      group("Collection",
        row("Open the dashboard on", "what you see first", seg([["home", "Home"], ["last", "Last game I viewed"]], s.openOn, (v) => set({ openOn: v }))),
        row("Card view", "grid of images, or the have / missing list", seg([["grid", "Grid"], ["list", "List"]], s.view, (v) => set({ view: v }))),
        row("Show hidden cards", "Gundam promos and EX cards, Palworld Souls · never counted in completion",
          toggle(s.showHidden, (v) => set({ showHidden: v })))),

      group("Binders & printing · defaults for new binders and prints",
        row("Reading order", null, seg([["ltr", "Left → right"], ["rtl", "Right → left"]], s.readingOrder, (v) => set({ readingOrder: v }))),
        row("Paper size", null, seg([["A4", "A4"], ["Letter", "Letter"]], s.paper, (v) => set({ paper: v }))),
        row("Pages in a new binder", null, number(s.binderPages, (v) => set({ binderPages: v }))),
        row("Cut lines on printed sheets", null, toggle(s.cutLines, (v) => set({ cutLines: v })))),

      h("section", { class: "panel row wrap" },
        h("div", { class: "grow stack-tight" }, h("span", { class: "eyebrow" }, "Your data"),
          h("span", {}, "Backed up every night to the ", h("code", {}, "backups"), " branch of your GitHub repository.")),
        h("button", { class: "btn", onClick: exportCsv }, "Download my collection (CSV)"),
        h("button", { class: "btn", onClick: () => { if (confirm("Reset all settings to their defaults?")) set(structuredClone(DEFAULT_SETTINGS), "Settings reset"); } }, "Reset to defaults")));
  }

  function swatches(game, current) {
    const wrap = h("div", { class: "row wrap swatches", role: "group", "aria-label": "Color" });
    for (const c of SWATCHES) wrap.append(h("button", { class: "swatch-btn" + (c === current ? " on" : ""), style: { background: c }, "aria-label": c,
      "aria-pressed": String(c === current), onClick: () => set({ accents: { ...state.settings.accents, [game]: c } }) }));
    const custom = h("input", { type: "color", value: current, "aria-label": "Custom color", class: "color-input" });
    custom.addEventListener("change", () => set({ accents: { ...state.settings.accents, [game]: custom.value } }));
    wrap.append(custom);
    return wrap;
  }

  async function exportCsv() {
    toast("Preparing your collection…");
    const lines = ["game,card_id,card_number,variant,set,name,rarity"];
    const q = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    for (const g of GAMES) {
      const data = await loadGame(g.id);
      for (const p of data.prints) if (p.owned) lines.push([g.id, p.id, p.number, p.variant, p.set, p.name, p.rarity].map(q).join(","));
    }
    download("my-collection-" + new Date().toISOString().slice(0, 10) + ".csv", new Blob([lines.join("\n") + "\n"], { type: "text/csv" }));
    toast("Downloaded " + (lines.length - 1) + " owned prints");
  }

  draw();
  return { el: root, update: draw };
}

// ── small controls ──
function group(title, ...rows) { return h("section", { class: "panel settings-group" }, h("span", { class: "eyebrow" }, title), rows); }
function row(label, hint, control) {
  return h("div", { class: "settings-row" }, h("span", { class: "stack-tight" }, h("span", {}, label), hint && h("span", { class: "muted small" }, hint)), control);
}
function seg(options, value, onPick) {
  return h("div", { class: "segmented", role: "group" }, options.map(([v, t]) =>
    h("button", { type: "button", class: v === value ? "on" : "", "aria-pressed": String(v === value), onClick: () => onPick(v) }, t)));
}
function toggle(on, onChange) {
  const box = h("input", { type: "checkbox", checked: !!on, class: "switch", role: "switch" });
  box.addEventListener("change", () => onChange(box.checked));
  return box;
}
function number(value, onChange) {
  const input = h("input", { type: "number", min: "1", max: "1000", value, class: "input slim num", "aria-label": "Pages" });
  input.addEventListener("change", () => onChange(Math.max(1, Math.min(1000, Number(input.value) || 100))));
  return input;
}
