// ============================================================
//  app.js — starts the dashboard and swaps pages when the address changes.
// ============================================================
import { h, errorBox } from "./ui.js";
import { parse, onRoute } from "./router.js";
import { state, subscribe, initAuth, loadSettings, loadProgress, prefetchGames } from "./store.js";
import { explain } from "./supabase.js";
import { topbar } from "./components/topbar.js";
import { openNewPassword } from "./components/signin.js";
import { homePage } from "./pages/home.js";
import { collectionPage } from "./pages/collection.js";
import { binderPage } from "./pages/binders.js";
import { changelogPage } from "./pages/changelog.js";
import { adminPage } from "./pages/admin.js";
import { settingsPage } from "./pages/settings.js";
import { binderEditPage } from "./pages/binder-edit.js";
import { GAMES } from "./config.js";

const app = document.getElementById("app");
let route = parse();

const PAGES = {
  "home":        () => homePage(),
  "collection":  (r) => collectionPage(r.game),
  "binders":     (r) => binderPage(r.game, null),
  "binder":      (r) => binderPage(r.game, r.id),
  "binder-edit": (r) => adminOnly(() => binderEditPage(r.game, r.id)),
  "changelog":   () => changelogPage(),
  "admin":       () => adminOnly(() => adminPage()),
  "settings":    () => adminOnly(() => settingsPage()),
  "not-found":   () => h("main", { class: "page narrow" }, h("h1", { class: "page-title" }, "Page not found"),
                          h("p", {}, h("a", { href: "#/" }, "Back to Home"))),
};

function adminOnly(build) {
  if (state.isAdmin) return build();
  return h("main", { class: "page narrow" }, h("h1", { class: "page-title" }, "Only for the collection's owner"),
    h("p", { class: "muted" }, state.session ? "This account can't open this page." : "Sign in to open this page."));
}

// A page is either a plain element, or { el, update?, destroy? } when it can
// refresh itself (so marking a card owned doesn't jump you back to the top).
let current = null;
let topEls = [];

function renderTop() {
  const next = topbar(route);
  if (topEls.length) { topEls.forEach((el, i) => el.replaceWith(next[i])); }
  else app.replaceChildren(...next);
  topEls = next;
}

let swapping = false;
function renderPage() {
  if (swapping) return;              // never start a page inside another page's start-up
  swapping = true;
  try { swapPage(); } finally { swapping = false; }
}
function swapPage() {
  const oldEl = current && current.el;
  if (current && current.destroy) current.destroy();
  const built = (PAGES[route.page] || PAGES["not-found"])(route);
  current = built instanceof Node ? { el: built } : built;
  if (oldEl && oldEl.parentNode === app) oldEl.replaceWith(current.el); else app.append(current.el);
  document.title = "TCG Dashboard" + (route.game ? " · " + GAMES.find((g) => g.id === route.game).label : "");
}

function render() { applyTheme(); renderTop(); renderPage(); }

let lastAdmin = null;
function onStateChange() {
  applyTheme();
  renderTop();
  // Signing in or out always rebuilds the page, so admin-only content never lingers on screen.
  // (Pages that adjust themselves to it — collection, binders — just update instead.)
  if (state.isAdmin !== lastAdmin) {
    lastAdmin = state.isAdmin;
    if (current && current.keepOnAuth && current.update) current.update(); else renderPage();
    return;
  }
  if (current && current.update) current.update(); else renderPage();
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
  app.replaceChildren();
  lastAdmin = state.isAdmin;
  render();
  subscribe(onStateChange);
  prefetchGames(GAMES.map((g) => g.id));      // quietly, after the first page is up
  onRoute((r) => {
    route = r;
    if (r.game) { try { localStorage.setItem("lastGame", r.game); } catch (_) { /* private mode */ } }
    render();
    window.scrollTo(0, 0);
  });
}

start();
