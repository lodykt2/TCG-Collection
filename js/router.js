// ============================================================
//  router.js — page addresses. Everything after "#" in the URL
//  decides the page, so links can be bookmarked and Back works.
//    #/                      home
//    #/digimon               Digimon collection
//    #/digimon/binders       Digimon binders
//    #/digimon/binders/12    one binder   (…/12/edit to change it)
//    #/changelog  #/admin  #/settings
// ============================================================
import { GAMES } from "./config.js";

const GAME_IDS = GAMES.map((g) => g.id);

export function parse(hash = location.hash) {
  if (/access_token=|error_description=|type=recovery/.test(hash)) return { page: "home" };   // sign-in links
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { page: "home" };
  if (["changelog", "admin", "settings"].includes(parts[0]) && parts.length === 1) return { page: parts[0] };
  if (GAME_IDS.includes(parts[0])) {
    const game = parts[0];
    if (parts.length === 1 || parts[1] === "collection") return { page: "collection", game };
    if (parts[1] === "binders") {
      if (parts.length === 2) return { page: "binders", game };
      if (parts[2] === "new") return { page: "binder-edit", game, id: null };
      if (/^\d+$/.test(parts[2])) return { page: parts[3] === "edit" ? "binder-edit" : "binder", game, id: Number(parts[2]) };
    }
  }
  return { page: "not-found" };
}

export const link = (path) => "#/" + path.replace(/^\/+/, "");
export function go(path) { location.hash = link(path); }
export function onRoute(fn) { window.addEventListener("hashchange", () => fn(parse())); }
