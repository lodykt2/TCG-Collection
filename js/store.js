// ============================================================
//  store.js — everything the dashboard knows, in one place.
//  Pages read from `state` and call these functions; when something
//  changes, every subscriber is told so it can redraw.
// ============================================================
import { sb } from "./supabase.js";
import { DEFAULT_SETTINGS } from "./config.js";

export const state = {
  session: null,        // who is signed in (null for visitors)
  isAdmin: false,       // true only for your account
  settings: structuredClone(DEFAULT_SETTINGS),
  progress: [],         // one row per game from the game_progress view
  games: {},            // loaded card lists, per game
  sets: {},             // sets per game, in release order
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(state); }

// ── SIGN-IN ───────────────────────────────────────────────────
export async function initAuth({ onPasswordRecovery } = {}) {
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  await refreshAdmin();
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === "PASSWORD_RECOVERY" && onPasswordRecovery) onPasswordRecovery();
    state.session = session;
    await refreshAdmin();
    emit();
  });
}

async function refreshAdmin() {
  if (!state.session) { state.isAdmin = false; return; }
  const { data, error } = await sb.rpc("is_admin");
  state.isAdmin = !error && data === true;
}

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function signOut() { await sb.auth.signOut(); }
export async function setNewPassword(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
}
export async function sendPasswordReset(email) {
  const back = location.origin + location.pathname;            // return to this dashboard
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: back });
  if (error) throw error;
}

// ── SETTINGS ──────────────────────────────────────────────────
export async function loadSettings() {
  const { data, error } = await sb.from("settings").select("value").eq("key", "dashboard").maybeSingle();
  if (error) throw error;
  const saved = (data && data.value) || {};
  state.settings = { ...structuredClone(DEFAULT_SETTINGS), ...saved,
                     accents: { ...DEFAULT_SETTINGS.accents, ...(saved.accents || {}) } };
  emit();
}

export async function saveSettings(changes) {
  const next = { ...state.settings, ...changes };
  const { error } = await sb.from("settings").upsert({ key: "dashboard", value: next });
  if (error) throw error;
  state.settings = next;
  emit();
}

// ── PROGRESS (fast summary from the game_progress view) ───────
export async function loadProgress() {
  const { data, error } = await sb.from("game_progress").select("*").order("sort_order");
  if (error) throw error;
  state.progress = data;
  emit();
}
export const progressFor = (game) => state.progress.find((p) => p.game === game);

// ── CARDS (a whole game in one request) ───────────────────────
// Each print arrives as [id, number, variant, set, name, rarity, type, color, image, owned, hidden].
export async function loadGame(game, { force = false } = {}) {
  if (state.games[game] && !force) return state.games[game];
  const { data, error } = await sb.rpc("game_cards", { p_game: game });
  if (error) throw error;
  const prints = data.map(([id, number, variant, set, name, rarity, type, color, image, owned, hidden]) =>
    ({ id, number, variant, set, name, rarity, type, color, image, owned, hidden }));
  state.games[game] = groupIntoCards(prints);
  emit();
  return state.games[game];
}

/** Prints → cards: one card per card number, collected if ANY print is owned. */
export function groupIntoCards(prints) {
  const byNumber = new Map();
  for (const p of prints) {
    let card = byNumber.get(p.number);
    if (!card) { card = { number: p.number, set: p.set, name: p.name, rarity: p.rarity, prints: [] }; byNumber.set(p.number, card); }
    card.prints.push(p);
    if (p.variant === "Base") { card.name = p.name; card.rarity = p.rarity; card.set = p.set; }
  }
  const cards = [...byNumber.values()];
  for (const c of cards) refreshCard(c);
  return { prints, cards, byNumber };
}

function refreshCard(card) {
  card.visible = card.prints.some((p) => !p.hidden);
  card.collected = card.prints.some((p) => p.owned);
  card.ownedPrint = card.prints.find((p) => p.owned) || null;   // the art to show
}

/** Mark one print owned / not owned. Updates the screen first, undoes it if saving fails. */
export async function setOwned(game, printId, owned) {
  const g = state.games[game];
  const print = g && g.prints.find((p) => p.id === printId);
  if (!print || print.owned === owned) return;
  print.owned = owned;
  refreshCard(g.byNumber.get(print.number));
  emit();
  const query = owned
    ? sb.from("owned").insert({ game, card_id: printId })
    : sb.from("owned").delete().match({ game, card_id: printId });
  const { error } = await query;
  if (error) {
    print.owned = !owned;
    refreshCard(g.byNumber.get(print.number));
    emit();
    throw error;
  }
  loadProgress().catch(() => {});       // refresh the counters quietly
}

// ── SETS (names and order, from the sets table) ──────────────
export async function loadSets(game) {
  if (state.sets[game]) return state.sets[game];
  const { data, error } = await sb.from("sets").select("code,name,set_group,sort_order").eq("game", game).order("sort_order");
  if (error) throw error;
  state.sets[game] = data;
  return data;
}
