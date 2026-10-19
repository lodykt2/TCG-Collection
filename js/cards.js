// ============================================================
//  cards.js — sorting and filtering, shared by the collection,
//  binders and the print window.
// ============================================================

/** Number part of a card number for sorting; tokens go after the set's other cards. */
export function numKey(number) {
  const digits = parseInt((String(number).match(/(\d+)$/) || [0, 0])[1], 10) || 0;
  return /TOKEN|^T-/i.test(number) ? 100000 + digits : digits;
}

/** Cards in release order: by set (sets table order), then card number. */
export function sortCards(cards, sets) {
  const order = new Map(sets.map((s, i) => [s.code, i]));
  return cards.slice().sort((a, b) =>
    (order.get(a.set) ?? 9999) - (order.get(b.set) ?? 9999) ||
    numKey(a.number) - numKey(b.number) ||
    (a.number < b.number ? -1 : a.number > b.number ? 1 : 0));
}

/** Prints in display order: Base first, then alt arts / parallels / promos. */
const VARIANT_RANK = ["Base", "Parallel SR", "Parallel TSR", "Parallel OSR", "Parallel SP", "Parallel TSP",
                      "Parallel SSP", "Parallel SSS", "Parallel SEC", "Promo", "Promo S"];
export function sortPrints(prints) {
  const rank = (v) => {
    const i = VARIANT_RANK.indexOf(v);
    if (i >= 0) return i * 100;
    const n = parseInt(String(v).replace(/\D/g, ""), 10);
    return 50 + (isNaN(n) ? 99 : n);                      // "Alt Art 1", "Alt Art 2"…
  };
  return prints.slice().sort((a, b) => rank(a.variant) - rank(b.variant) || (a.id < b.id ? -1 : 1));
}

export const basePrint = (card) => card.prints.find((p) => p.variant === "Base") || sortPrints(card.prints)[0];
export const shownPrint = (card) => card.ownedPrint || basePrint(card);

/**
 * filters = { q, set, rarity, owned: "all" | "owned" | "missing" }
 * Returns { list, scope } — scope ignores the owned filter, for the counters.
 */
export function filterCards(cards, filters, { showHidden = false } = {}) {
  const q = (filters.q || "").trim().toLowerCase();
  const scope = cards.filter((c) =>
    (showHidden || c.visible) &&
    (!filters.set || c.set === filters.set) &&
    (!filters.rarity || c.rarity === filters.rarity) &&
    (!q || c.name.toLowerCase().includes(q) || c.number.toLowerCase().includes(q) ||
           c.prints.some((p) => p.id.toLowerCase().includes(q))));
  const list = filters.owned === "owned" ? scope.filter((c) => c.collected)
             : filters.owned === "missing" ? scope.filter((c) => !c.collected) : scope;
  return { list, scope };
}
