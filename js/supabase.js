// ============================================================
//  supabase.js — the connection to your database.
//  Loads Supabase's official library from a CDN at a fixed version.
// ============================================================
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },   // stay signed in on this browser
});

/** Supabase errors → one readable sentence for the screen. */
export function explain(error) {
  if (!error) return "";
  const m = String(error.message || error);
  if (/Invalid login credentials/i.test(m)) return "That email and password don't match.";
  if (/row-level security|permission denied/i.test(m)) return "You need to be signed in to do that.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Can't reach the database — check your connection.";
  return m;
}
