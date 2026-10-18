// ============================================================
//  config.js — the only file with project-specific values.
//  The publishable key is meant to be public (the database's access
//  rules decide what it can do). NEVER put the secret key here.
// ============================================================

export const SUPABASE_URL = "https://ewcnaeijypkivhnttpck.supabase.co";
export const SUPABASE_KEY = "sb_publishable_ID1QWd_tFuAz0jW6HucHbQ_BBm_JSjv";

// Games in tab order.
export const GAMES = [
  { id: "digimon",  label: "Digimon",  color: "#60a5fa" },
  { id: "gundam",   label: "Gundam",   color: "#22d3ee" },
  { id: "palworld", label: "Palworld", color: "#aed581" },
];

// Used until your saved settings load (and for visitors).
export const DEFAULT_SETTINGS = {
  theme: "dark",                      // dark | light | system
  accents: { digimon: "#60a5fa", gundam: "#22d3ee", palworld: "#aed581" },
  openOn: "home",                     // home | last
  view: "grid",                       // grid | list
  showHidden: false,
  readingOrder: "rtl",                // ltr | rtl
  paper: "A4",                        // A4 | Letter
  binderPages: 100,
  cutLines: true,
};
