// ============================================================
//  topbar.js — the header and the navigation tabs (layout A).
// ============================================================
import { h, fmt } from "../ui.js";
import { icon } from "./icons.js";
import { GAMES } from "../config.js";
import { link } from "../router.js";
import { state, progressFor, signOut } from "../store.js";
import { openSignIn } from "./signin.js";

export function topbar(route) {
  const signedIn = !!state.session;
  const email = state.session && state.session.user && state.session.user.email;

  const header = h("header", { class: "topbar" },
    h("a", { class: "brand", href: link("") },
      h("span", { class: "eyebrow" }, "// collection tracker"),
      h("span", { class: "brand-name" }, "TCG Dashboard")),
    h("div", { class: "topbar-right" },
      signedIn
        ? [h("span", { class: "mono muted" }, "Signed in · " + (email ? email.split("@")[0] : "")),
           state.isAdmin && h("a", { class: "btn" + (route.page === "settings" ? " btn-active" : ""), href: link("settings") }, "Settings"),
           h("button", { class: "btn", onClick: () => signOut() }, "Sign out")]
        : h("button", { class: "btn btn-accent", onClick: () => openSignIn() }, "Sign in")));

  const gameTab = (g) => {
    const p = progressFor(g.id);
    const active = route.game === g.id;
    const color = state.settings.accents[g.id] || g.color;
    return h("a", { class: "tab" + (active ? " active" : ""), href: link(g.id), style: active ? { borderBottomColor: color } : null,
                    "aria-current": active ? "page" : null },
      icon(g.id, color), g.label,
      p && h("span", { class: "tab-count" }, fmt(p.collected) + "/" + fmt(p.cards)));
  };

  const pageLinks = [];
  if (route.game) {
    pageLinks.push(h("a", { class: "pill" + (route.page === "collection" ? " active" : ""), href: link(route.game) }, "Collection"));
    pageLinks.push(h("a", { class: "pill" + (/binder/.test(route.page) ? " active" : ""), href: link(route.game + "/binders") }, "Binders"));
  }
  pageLinks.push(h("a", { class: "pill" + (route.page === "changelog" ? " active" : ""), href: link("changelog") }, "Changelog"));
  if (state.isAdmin) pageLinks.push(h("a", { class: "pill" + (route.page === "admin" ? " active" : ""), href: link("admin") }, "Admin"));

  const nav = h("nav", { class: "navbar", "aria-label": "Main" },
    h("div", { class: "tabs" },
      h("a", { class: "tab" + (route.page === "home" ? " active home" : ""), href: link(""), "aria-current": route.page === "home" ? "page" : null },
        icon("home", "currentColor"), "Home"),
      GAMES.map(gameTab)),
    h("div", { class: "pills" }, pageLinks));

  return [header, nav];
}
