// ============================================================
//  app.js — starts the dashboard and swaps pages when the address changes.
// ============================================================
import { h, comingLater, errorBox } from "./ui.js";
import { parse, onRoute } from "./router.js";
import { state, subscribe, initAuth, loadSettings, loadProgress } from "./store.js";
import { explain } from "./supabase.js";
import { topbar } from "./components/topbar.js";
import { openNewPassword } from "./components/signin.js";
import { homePage } from "./pages/home.js";
import { GAMES } from "./config.js";

const app = document.getElementById("app");
let route = parse();

const PAGES = {
  "home":        () => homePage(),
  "collection":  () => comingLater("Collection", 3),
  "binders":     () => comingLater("Binders", 5),
  "binder":      () => comingLater("Binder", 5),
  "binder-edit": () => adminOnly(() => comingLater("Edit binder", 5)),
  "changelog":   () => comingLater("Changelog", 6),
  "admin":       () => adminOnly(() => comingLater("Admin", 7)),
  "settings":    () => adminOnly(() => comingLater("Settings", 7)),
  "not-found":   () => h("main", { class: "page narrow" }, h("h1", { class: "page-title" }, "Page not found"),
                          h("p", {}, h("a", { href: "#/" }, "Back to Home"))),
};

function adminOnly(build) {
  if (state.isAdmin) return build();
  return h("main", { class: "page narrow" }, h("h1", { class: "page-title" }, "Only for the collection's owner"),
    h("p", { class: "muted" }, state.session ? "This account can't open this page." : "Sign in to open this page."));
}

function render() {
  applyTheme();
  const page = (PAGES[route.page] || PAGES["not-found"])();
  app.replaceChildren(...topbar(route), page);
  document.title = "TCG Dashboard" + (route.game ? " · " + GAMES.find((g) => g.id === route.game).label : "");
}

function applyTheme() {
  const s = state.settings;
  const dark = s.theme === "system" ? !window.matchMedia("(prefers-color-scheme: light)").matches : s.theme !== "light";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  for (const g of GAMES) document.documentElement.style.setProperty("--" + g.id, s.accents[g.id] || g.color);
}

async function start() {
  try {
    await Promise.all([initAuth({ onPasswordRecovery: openNewPassword }), loadSettings(), loadProgress()]);
  } catch (err) {
    app.replaceChildren(h("main", { class: "page narrow" }, errorBox("The dashboard couldn't load: " + explain(err), () => location.reload())));
    return;
  }
  // "Open the dashboard on: last game I viewed"
  if (route.page === "home" && !location.hash && state.settings.openOn === "last") {
    const last = localStorage.getItem("lastGame");
    if (last && GAMES.some((g) => g.id === last)) { history.replaceState(null, "", "#/" + last); route = parse(); }
  }
  render();
  subscribe(() => render());
  onRoute((r) => {
    route = r;
    if (r.game) { try { localStorage.setItem("lastGame", r.game); } catch (_) { /* private mode */ } }
    render();
    window.scrollTo(0, 0);
  });
}

start();
