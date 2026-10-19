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
// Change notices are gathered and delivered together once the current step has finished.
// (Delivering them mid-step could make a page start drawing itself twice.)
let notifyQueued = false;
function emit() {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => { notifyQueued = false; for (const fn of listeners) fn(state); });
}

// ── SIGN-IN ───────────────────────────────────────────────────
export async function initAuth({ onPasswordRecovery } = {}) {
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  await refreshAdmin();
  // IMPORTANT: this listener must not call Supabase itself. Doing so is a known
  // supabase-js deadlock that makes every later request hang ("Loading…" forever).
  // Follow-up work is scheduled to run just after the listener has returned.
  sb.auth.onAuthStateChange((event, session) => {
    state.session = session;
    setTimeout(async () => {
      if (event === "PASSWORD_RECOVERY" && onPasswordRecovery) onPasswordRecovery();
      await refreshAdmin();
      emit();
    }, 0);
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
// A copy is kept in this browser, so a game opens instantly; the database is then
// checked quietly and anything that changed is updated in place.
const CACHE_VERSION = 1;
const pending = {};
const editedAt = {};          // printId → when you last changed it here (a check started earlier can't undo it)

export async function loadGame(game, { force = false } = {}) {
  if (state.games[game] && !force) return state.games[game];
  if (!force) {
    const cached = readCache(game);
    if (cached) {
      state.games[game] = groupIntoCards(cached.map(toPrint));
      emit();
      refreshGame(game);                                  // check for changes, no waiting
      return state.games[game];
    }
  }
  return refreshGame(game);
}

/** Downloads the card list; updates the loaded game in place when only details changed.
 *  fresh: true → if a check is already running (it may have started before your change),
 *  wait for it, then fetch again. */
export function refreshGame(game, { fresh = false } = {}) {
  if (pending[game]) return fresh ? pending[game].catch(() => {}).then(() => refreshGame(game)) : pending[game];
  pending[game] = (async () => {
    const startedAt = Date.now();
    try {
      const { data, error } = await sb.rpc("game_cards", { p_game: game });
      if (error) throw error;
      writeCache(game, data);
      const fresh = data.map(toPrint);
      const current = state.games[game];
      if (current && sameCards(current.prints, fresh)) {
        const byId = new Map(fresh.map((p) => [p.id, p]));
        let changed = false;
        for (const p of current.prints) {
          const f = byId.get(p.id);
          const recentEdit = (editedAt[p.id] || 0) >= startedAt;
          for (const k of ["owned", "hidden", "name", "rarity", "image", "variant", "type", "color"]) {
            if (k === "owned" && recentEdit) continue;      // your newer change wins
            if (p[k] !== f[k]) { p[k] = f[k]; changed = true; }
          }
        }
        if (changed) { for (const c of current.cards) refreshCard(c); emit(); }
        return current;
      }
      state.games[game] = groupIntoCards(fresh);
      state.games[game].replaced = true;                  // pages redraw once for new cards
      emit();
      return state.games[game];
    } finally {
      delete pending[game];
    }
  })();
  return pending[game];
}

const toPrint = ([id, number, variant, set, name, rarity, type, color, image, owned, hidden]) =>
  ({ id, number, variant, set, name, rarity, type, color, image, owned, hidden });
const toRow = (p) => [p.id, p.number, p.variant, p.set, p.name, p.rarity, p.type, p.color, p.image, p.owned, p.hidden];

function sameCards(a, b) {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((p) => p.id + "|" + p.number + "|" + p.set));
  return b.every((p) => ids.has(p.id + "|" + p.number + "|" + p.set));
}

function readCache(game) {
  try {
    const saved = JSON.parse(localStorage.getItem("cards:" + game) || "null");
    return saved && saved.v === CACHE_VERSION ? saved.rows : null;
  } catch (_) { return null; }
}
function writeCache(game, rows) {
  try { localStorage.setItem("cards:" + game, JSON.stringify({ v: CACHE_VERSION, savedAt: Date.now(), rows })); }
  catch (_) { /* browser storage full or disabled: just skip the copy */ }
}
let cacheTimer = {};
function saveGameSoon(game) {
  clearTimeout(cacheTimer[game]);
  cacheTimer[game] = setTimeout(() => { const g = state.games[game]; if (g) writeCache(game, g.prints.map(toRow)); }, 1500);
}

/** Loads the other games quietly so switching tabs is instant. */
export function prefetchGames(games) {
  let i = 0;
  const next = () => { if (i < games.length) loadGame(games[i++]).catch(() => {}).finally(() => setTimeout(next, 300)); };
  setTimeout(next, 1500);
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
  editedAt[printId] = Date.now();
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
  saveGameSoon(game);
  refreshProgressSoon();
}

let progressTimer = null;
/** Counters refresh once you pause, not after every click. */
export function refreshProgressSoon() {
  clearTimeout(progressTimer);
  progressTimer = setTimeout(() => loadProgress().catch(() => {}), 1200);
}

// ── SETS (names and order, from the sets table) ──────────────
export async function loadSets(game) {
  if (state.sets[game]) return state.sets[game];
  const { data, error } = await sb.from("sets").select("code,name,set_group,sort_order").eq("game", game).order("sort_order");
  if (error) throw error;
  state.sets[game] = data;
  return data;
}

/** Mark many prints at once (signed-in admin). Uses the database's bulk_set_owned,
 *  which saves a restore point first and logs each change. */
export async function bulkSetOwned(game, printIds, owned) {
  const { data, error } = await sb.rpc("bulk_set_owned", { p_game: game, p_card_ids: printIds, p_owned: owned });
  if (error) throw error;
  await refreshGame(game, { fresh: true });
  refreshProgressSoon();
  return data;                      // { changed, unknown_ids }
}
