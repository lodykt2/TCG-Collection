// ============================================================
//  admin.js — only for you. Sections: Pending approvals, Review,
//  Syncs, Restore points, Overrides, Add a card. Pending and Review
//  only appear when they have something in them.
// ============================================================
import { h, fmt, toast, errorBox } from "../ui.js";
import { GAMES } from "../config.js";
import { sb, explain } from "../supabase.js";
import { state, refreshGame, loadProgress } from "../store.js";

const FIELDS = ["Card Name", "Rarity", "Card Type", "Color", "Image URL", "Product", "Card Number", "Variant", "Set Code", "Hidden", "Exclude", "Keep"];
const gameLabel = (id) => (GAMES.find((g) => g.id === id) || { label: id }).label;
const when = (iso) => new Date(iso).toLocaleString("en", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function adminPage() {
  const root = h("main", { class: "page admin" });
  let tab = sessionStorage.getItem("admin:tab") || "";
  let counts = { pending: 0, review: 0 };
  let prefill = null;                    // card picked from Review → Overrides form

  const body = h("div", { class: "admin-body" });
  const tabsEl = h("div", { class: "admin-tabs", role: "tablist", "aria-label": "Admin sections" });
  root.append(
    h("div", { class: "row wrap" }, h("h1", { class: "page-title" }, "Admin"), h("span", { class: "badge" }, "only you can see this")),
    tabsEl, body);

  async function refreshCounts() {
    const [p, r] = await Promise.all([sb.from("pending").select("id"), sb.from("review").select("id")]);
    counts = { pending: (p.data || []).length, review: (r.data || []).length };
  }

  function tabs() {
    const list = [
      ["pending", "Pending approvals", counts.pending, counts.pending > 0],
      ["review", "Review", counts.review, counts.review > 0],
      ["syncs", "Syncs", 0, true], ["restore", "Restore points", 0, true],
      ["overrides", "Overrides", 0, true], ["manual", "Add a card", 0, true],
    ].filter((t) => t[3]);
    if (!list.some((t) => t[0] === tab)) tab = list[0][0];
    tabsEl.replaceChildren(...list.map(([id, label, n]) =>
      h("button", { role: "tab", "aria-selected": String(tab === id), class: "admin-tab" + (tab === id ? " on" : ""),
                    onClick: () => { tab = id; sessionStorage.setItem("admin:tab", id); show(); } },
        label, n > 0 && h("span", { class: "count" }, String(n)))));
  }

  async function show() {
    tabs();
    body.replaceChildren(h("p", { class: "muted" }, "Loading…"));
    try { body.replaceChildren(await SECTIONS[tab]()); }
    catch (err) { body.replaceChildren(errorBox(explain(err), show)); }
  }

  // ── Pending approvals ──
  async function pendingSection() {
    const { data, error } = await sb.from("pending").select("*").order("detected_at");
    if (error) throw error;
    const rows = data.map((r) => {
      const decide = async (d) => {
        const { error: e } = await sb.from("pending").update({ decision: d }).eq("id", r.id);
        if (e) { toast("Not saved: " + explain(e), "err"); return; }
        r.decision = d; toast(d === "Approve" ? "Approved — applied at the next sync" : "Rejected — kept as it is"); show();
      };
      return h("div", { class: "admin-row" },
        h("span", { class: "strong w-game" }, gameLabel(r.game)),
        h("span", { class: "mono w-id" }, r.card_id),
        h("span", { class: "grow" }, h("span", { class: "strong" }, r.field + ": "),
          r.field === "Removed from source" ? r.current_value : [h("span", { class: "muted" }, r.current_value), " → ", h("span", {}, r.new_value)]),
        r.decision ? h("span", { class: "badge" }, r.decision + "d")
          : [h("button", { class: "btn btn-accent", onClick: () => decide("Approve") }, "Approve"),
             h("button", { class: "btn", onClick: () => decide("Reject") }, "Reject")]);
    });
    const games = [...new Set(data.filter((r) => r.decision).map((r) => r.game))];
    return h("section", { class: "stack" },
      h("p", { class: "muted" }, "Changes the source suggested for cards you already have. Your decision is applied at the next sync."),
      ...rows,
      games.length > 0 && h("div", { class: "row wrap" }, h("span", { class: "muted" }, "Apply your decisions now:"),
        games.map((g) => runButton(g, "full", "Sync " + gameLabel(g) + " now"))));
  }

  // ── Review ──
  async function reviewSection() {
    const { data, error } = await sb.from("review").select("*").order("game").order("issue");
    if (error) throw error;
    return h("section", { class: "stack" },
      h("p", { class: "muted" }, "Things the last sync couldn't decide on its own. Most are just for information."),
      h("div", { class: "table-wrap" }, h("table", { class: "card-table" },
        h("thead", {}, h("tr", {}, ["Game", "Card", "Issue", "Detail", ""].map((t) => h("th", { scope: "col" }, t)))),
        h("tbody", {}, data.map((r) => h("tr", {},
          h("td", {}, gameLabel(r.game)), h("td", { class: "mono" }, r.reference), h("td", {}, r.issue), h("td", { class: "muted" }, r.detail),
          h("td", {}, h("button", { class: "btn", onClick: () => { prefill = { game: r.game, card_id: r.reference }; tab = "overrides"; show(); } }, "Fix with override"))))))));
  }

  // ── Syncs ──
  function runButton(game, mode, label) {
    return h("button", { class: "btn btn-accent", onClick: async (e) => {
      const b = e.currentTarget; b.disabled = true;
      const { error } = await sb.rpc("admin_run_sync", { p_game: game, p_mode: mode });
      if (error) { toast("Couldn't start: " + explain(error), "err"); b.disabled = false; return; }
      toast(gameLabel(game) + " sync started — results appear below in a minute");
      setTimeout(() => { if (tab === "syncs") show(); }, 4000);
    } }, label);
  }
  async function syncsSection() {
    const { data, error } = await sb.from("sync_runs").select("*").order("id", { ascending: false }).limit(20);
    if (error) throw error;
    const running = data.some((r) => r.status === "running");
    if (running) setTimeout(() => { if (tab === "syncs" && document.body.contains(root)) show(); }, 8000);
    const result = (r) => {
      if (r.status !== "done") return r.message || r.status;
      const s = r.stats || {};
      const parts = [s.new_cards && fmt(s.new_cards) + " new cards", s.new_alt_arts && fmt(s.new_alt_arts) + " new alt arts",
                     s.pending && fmt(s.pending) + " waiting", s.removed && fmt(s.removed) + " removed"].filter(Boolean);
      return parts.join(" · ") || "no changes";
    };
    return h("section", { class: "stack" },
      h("div", { class: "sync-cards" },
        h("div", { class: "panel stack-tight" }, h("span", { class: "strong" }, "Digimon"), h("span", { class: "muted small" }, "Mondays 06:00 (recent sets) · 1st of the month 07:00 (full)"),
          h("div", { class: "row wrap" }, runButton("digimon", "weekly", "Check recent sets"), runButton("digimon", "full", "Full check"))),
        h("div", { class: "panel stack-tight" }, h("span", { class: "strong" }, "Gundam"), h("span", { class: "muted small" }, "Tuesdays 06:00"),
          h("div", { class: "row wrap" }, runButton("gundam", "full", "Sync now"))),
        h("div", { class: "panel stack-tight" }, h("span", { class: "strong" }, "Palworld"), h("span", { class: "muted small" }, "Wednesdays 06:00"),
          h("div", { class: "row wrap" }, runButton("palworld", "full", "Sync now")))),
      h("div", { class: "table-wrap" }, h("table", { class: "card-table" },
        h("thead", {}, h("tr", {}, ["Run", "Game", "Type", "Started (your time)", "Result"].map((t) => h("th", { scope: "col" }, t)))),
        h("tbody", {}, data.map((r) => h("tr", {},
          h("td", { class: "mono" }, "#" + r.id), h("td", { class: "strong" }, gameLabel(r.game)), h("td", {}, r.mode),
          h("td", { class: "mono muted" }, when(r.started_at)),
          h("td", {}, h("span", { class: "badge status-" + r.status }, r.status), " ", result(r))))))));
  }

  // ── Restore points ──
  async function restoreSection() {
    const { data, error } = await sb.from("owned_snapshot_list").select("*").order("id", { ascending: false }).limit(60);
    if (error) throw error;
    return h("section", { class: "stack" },
      h("p", { class: "muted" }, "Your owned cards are saved before every sync and bulk change. Restoring saves your current state first, so it can be undone too."),
      ...data.map((s) => h("div", { class: "admin-row" },
        h("span", { class: "strong w-game" }, gameLabel(s.game)),
        h("span", { class: "grow" }, s.reason),
        h("span", { class: "mono muted" }, when(s.at)),
        h("span", { class: "mono w-count" }, fmt(s.owned_count) + " owned"),
        h("button", { class: "btn", onClick: async () => {
          if (!confirm("Restore " + gameLabel(s.game) + " to " + fmt(s.owned_count) + " owned cards from " + when(s.at) + "?\nYour current state is saved first.")) return;
          const { data: res, error: e } = await sb.rpc("restore_owned", { p_snapshot_id: s.id });
          if (e) { toast("Couldn't restore: " + explain(e), "err"); return; }
          await refreshGame(s.game, { fresh: true }); loadProgress().catch(() => {});
          toast("Restored: " + (res ? res.added + " added, " + res.removed + " removed" : "done"));
          show();
        } }, "Restore…"))));
  }

  // ── Overrides ──
  async function overridesSection() {
    const { data, error } = await sb.from("overrides").select("*").order("id", { ascending: false });
    if (error) throw error;
    const game = select(GAMES.map((g) => [g.id, g.label]), (prefill && prefill.game) || "digimon");
    const card = h("input", { class: "input slim", placeholder: "e.g. BT1-010", value: (prefill && prefill.card_id) || "", "aria-label": "Card ID" });
    const field = select(FIELDS.map((f) => [f, f]), "Card Name");
    const value = h("input", { class: "input slim", "aria-label": "Value", placeholder: "new value, or Yes / No" });
    const note = h("input", { class: "input slim", "aria-label": "Note", placeholder: "why (optional)" });
    prefill = null;
    const add = async () => {
      if (!(card.value || "").trim()) { toast("Enter a card ID", "err"); return; }
      const { error: e } = await sb.from("overrides").insert({ game: game.value, card_id: (card.value || "").trim(), field: field.value, value: (value.value || "").trim(), note: (note.value || "").trim() });
      if (e) { toast("Not saved: " + explain(e), "err"); return; }
      toast("Override saved — applied at the next " + gameLabel(game.value) + " sync"); show();
    };
    return h("section", { class: "stack" },
      h("p", { class: "muted" }, "Permanent corrections the sync always applies. Exclude = Yes removes a card; Keep = Yes keeps it if the source drops it; Hidden = Yes / No."),
      h("div", { class: "panel form-grid" },
        label("Game", game), label("Card ID", card), label("Field", field), label("Value", value), label("Note", note),
        h("button", { class: "btn btn-primary", onClick: add }, "Add override")),
      data.length > 0 && h("div", { class: "stack" }, data.map((o) => h("div", { class: "admin-row" },
        h("span", { class: "strong w-game" }, gameLabel(o.game)), h("span", { class: "mono w-id" }, o.card_id),
        h("span", { class: "grow" }, h("span", { class: "strong" }, o.field + " = "), o.value, o.note && h("span", { class: "muted" }, " · " + o.note)),
        h("button", { class: "btn btn-icon danger", "aria-label": "Delete override", onClick: async () => {
          if (!confirm("Delete this override? The source's value returns at the next sync.")) return;
          const { error: e } = await sb.from("overrides").delete().eq("id", o.id);
          if (e) toast(explain(e), "err"); else { toast("Override deleted"); show(); }
        } }, "✕")))));
  }

  // ── Add a card ──
  async function manualSection() {
    const { data, error } = await sb.from("manual_cards").select("*").order("game");
    if (error) throw error;
    const game = select(GAMES.map((g) => [g.id, g.label]), "digimon");
    const f = Object.fromEntries(["card_id", "card_number", "variant", "set_code", "name", "rarity", "image_url"].map((k) => [k, h("input", { class: "input slim", "aria-label": k })]));
    f.card_number.placeholder = "same as ID"; f.variant.placeholder = "Base"; f.image_url.placeholder = "optional";
    const hidden = h("input", { type: "checkbox" });
    const add = async () => {
      if (!(f.card_id.value || "").trim() || !(f.name.value || "").trim()) { toast("Card ID and name are needed", "err"); return; }
      const row = { game: game.value, hidden: !!hidden.checked };
      for (const [k, el] of Object.entries(f)) row[k] = (el.value || "").trim();
      const { error: e } = await sb.from("manual_cards").insert(row);
      if (e) { toast("Not saved: " + explain(e), "err"); return; }
      toast("Card saved — it appears after the next " + gameLabel(game.value) + " sync"); show();
    };
    return h("section", { class: "stack" },
      h("p", { class: "muted" }, "For a card no source lists yet. If a source starts listing it, Review tells you so you can delete your copy."),
      h("div", { class: "panel form-grid" },
        label("Game", game), label("Card ID", f.card_id), label("Card number", f.card_number), label("Variant", f.variant),
        label("Set code", f.set_code), label("Name", f.name), label("Rarity", f.rarity), label("Image link", f.image_url),
        h("label", { class: "row small" }, hidden, "Hidden (not counted)"),
        h("button", { class: "btn btn-primary", onClick: add }, "Add card")),
      data.length > 0 && h("div", { class: "stack" }, data.map((m) => h("div", { class: "admin-row" },
        h("span", { class: "strong w-game" }, gameLabel(m.game)), h("span", { class: "mono w-id" }, m.card_id),
        h("span", { class: "grow" }, m.name, h("span", { class: "muted" }, " · " + [m.set_code, m.rarity, m.variant].filter(Boolean).join(" · "))),
        h("button", { class: "btn btn-icon danger", "aria-label": "Delete card", onClick: async () => {
          if (!confirm("Delete " + m.card_id + "? It disappears at the next sync.")) return;
          const { error: e } = await sb.from("manual_cards").delete().match({ game: m.game, card_id: m.card_id });
          if (e) toast(explain(e), "err"); else { toast("Deleted"); show(); }
        } }, "✕")))));
  }

  const SECTIONS = { pending: pendingSection, review: reviewSection, syncs: syncsSection, restore: restoreSection, overrides: overridesSection, manual: manualSection };
  refreshCounts().then(show).catch((err) => body.replaceChildren(errorBox(explain(err), () => location.reload())));
  return { el: root, update() {} };
}

function select(options, value) {
  return h("select", { class: "input slim" }, options.map(([v, t]) => h("option", { value: v, selected: v === value }, t)));
}
function label(text, control) { return h("label", { class: "field" }, text, control); }
