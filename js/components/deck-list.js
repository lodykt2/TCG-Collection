// ============================================================
//  deck-list.js — cards as plain text ("1 Name NUMBER" per line),
//  to paste into deck builders or keep as a shopping list.
// ============================================================
import { h, openModal, toast } from "../ui.js";
import { download } from "../lib/image-data.js";

const DECK_SITES = { digimon: "https://digimoncard.io/deckbuilder", gundam: "https://whitebase.dev" };

export function openDeckList(game, cards, title) {
  const text = cards.map((c) => "1 " + c.name + " " + c.number).join("\n");
  const area = h("textarea", { class: "input deck-text", readonly: true, "aria-label": "Deck list" }, text);
  const site = DECK_SITES[game];
  const content = h("div", { class: "stack" },
    h("div", { class: "modal-head" },
      h("div", {}, h("h2", { class: "modal-title" }, title), h("p", { class: "muted small" }, cards.length + " cards")),
      h("button", { class: "btn btn-icon", "aria-label": "Close", onClick: () => close() }, "✕")),
    area,
    h("div", { class: "row wrap" },
      h("button", { class: "btn btn-primary", onClick: copy }, "Copy"),
      h("button", { class: "btn", onClick: () => download(game + "-list.txt", new Blob([text], { type: "text/plain" })) }, "Download .txt"),
      site && h("a", { class: "btn", href: site, target: "_blank", rel: "noopener" }, "Open deck builder ↗")));
  async function copy() {
    try { await navigator.clipboard.writeText(text); toast("Copied " + cards.length + " cards"); }
    catch (_) { area.select(); toast("Press Ctrl+C to copy", "err"); }
  }
  const close = openModal(content, { label: title });
}
