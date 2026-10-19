// ============================================================
//  prints-drawer.js — the panel that slides in from the right
//  with every print of a card. You (signed in) can tick any print;
//  visitors see what's owned but can't change it.
// ============================================================
import { h, toast } from "../ui.js";
import { cardImage } from "../images.js";
import { sortPrints, basePrint } from "../cards.js";
import { state, setOwned } from "../store.js";
import { explain } from "../supabase.js";

export function createDrawer(game) {
  let card = null;
  let preview = null;            // the print shown large
  const panel = h("aside", { class: "drawer", "aria-label": "Card details", hidden: true });
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  function open(c) {
    card = c;
    preview = c.ownedPrint || basePrint(c);
    panel.hidden = false;
    draw();
    const btn = panel.querySelector(".drawer-close");
    btn && btn.focus && btn.focus();
  }
  function close() { panel.hidden = true; card = null; }
  function refresh() { if (card && !panel.hidden) draw(); }

  function draw() {
    const prints = sortPrints(card.prints);
    const ownedCount = prints.filter((p) => p.owned).length;
    const canEdit = state.isAdmin;
    // .filter(Boolean) drops the parts that don't apply (otherwise the browser writes "false")
    panel.replaceChildren(...[
      h("div", { class: "drawer-head" },
        h("div", {},
          h("div", { class: "mono muted" }, [card.number, card.rarity, preview.color, preview.type].filter(Boolean).join(" · ")),
          h("h2", { class: "drawer-title" }, card.name)),
        h("button", { class: "btn btn-icon drawer-close", "aria-label": "Close", onClick: close }, "✕")),
      cardImage(preview, { className: "drawer-img", alt: card.name + " · " + preview.variant }),
      h("div", { class: "row" },
        h("span", { class: "eyebrow" }, "Prints"),
        h("span", { class: "spacer" }),
        h("span", { class: card.collected ? "badge badge-ok" : "badge" },
          card.collected ? "Collected · " + ownedCount + " of " + prints.length + " owned" : "Missing")),
      h("div", { class: "print-list" }, prints.map((p) => printRow(p, canEdit))),
      !canEdit && h("p", { class: "muted small" }, "Sign in to mark cards as owned."),
    ].filter(Boolean));
  }

  function printRow(p, canEdit) {
    const box = h("input", { type: "checkbox", checked: p.owned, disabled: !canEdit,
                             "aria-label": "Own " + p.id + " (" + p.variant + ")" });
    box.addEventListener("change", async () => {
      box.disabled = true;
      try { await setOwned(game, p.id, box.checked); }
      catch (err) { toast("Not saved: " + explain(err), "err"); }
      finally { box.disabled = !state.isAdmin; }
    });
    return h("div", { class: "print-row" + (p === preview ? " previewing" : "") + (p.hidden ? " is-hidden" : "") },
      h("button", { class: "print-thumb", "aria-label": "Show " + p.variant, onClick: () => { preview = p; draw(); } },
        cardImage(p, { className: "thumb-img" })),
      h("span", { class: "print-text" },
        h("span", { class: "print-label" }, p.variant, p.hidden && h("span", { class: "muted" }, " · hidden")),
        h("span", { class: "mono muted" }, p.id)),
      h("label", { class: "check" }, box));
  }

  return { el: panel, open, close, refresh, get card() { return card; } };
}
