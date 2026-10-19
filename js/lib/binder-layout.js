// ============================================================
//  lib/binder-layout.js — turns a binder (sets in order + empty pages
//  and pockets) into real pages of 4 pockets. Pure calculation, so the
//  binder view, the builder and the placeholder PDF all agree exactly.
//
//  Pockets are numbered 1–4 in READING order. On screen they're placed
//  by reading order: left → right, or right → left (1 2 / 3 4 becomes
//  2 1 / 4 3).
// ============================================================
export const POCKETS = 4;

/**
 * binder:      { pages, reading_order, sets: [{ code, new_page }], adjustments: [...] }
 * cardsBySet:  Map(setCode → cards in card-number order)   (visible cards only)
 * adjustments: { kind: "empty_pages" | "empty_pockets",
 *                after_kind: "start" | "set" | "page" | "card", after_value, count }
 * → { pages: [{ n, kind: "cards" | "empty", set, pockets: [{ card } | { blank } | { unused }] }],
 *     where: Map(cardNumber → { page, pocket }), used, capacity, fits }
 */
export function layoutBinder(binder, cardsBySet) {
  const pages = [];
  const where = new Map();
  const adj = binder.adjustments || [];
  const atStart  = adj.filter((a) => a.after_kind === "start");
  const afterSet = (code) => adj.filter((a) => a.after_kind === "set" && a.after_value === code);
  const afterCard = (num) => adj.filter((a) => a.after_kind === "card" && a.after_value === num);
  const afterPage = new Map();
  for (const a of adj) if (a.after_kind === "page") {
    const n = Number(a.after_value);
    afterPage.set(n, (afterPage.get(n) || []).concat(a));
  }
  let cur = null;         // the page being filled
  let setCode = null;

  const closePage = () => {
    if (cur && cur.kind === "cards") while (cur.pockets.length < POCKETS) cur.pockets.push({ unused: true });
    cur = null;
  };
  const addEmptyPages = (count) => {
    closePage();
    for (let i = 0; i < count; i++) pages.push({ n: pages.length + 1, kind: "empty", set: null, pockets: [] });
    flushPageAdjustments();
  };
  // empty pages asked for "after page N" go in as soon as page N is complete
  const flushPageAdjustments = () => {
    const last = pages.length;
    const due = afterPage.get(last);
    if (due && (!cur || cur.pockets.length >= POCKETS || cur.kind === "empty")) {
      afterPage.delete(last);
      for (const a of due) if (a.kind === "empty_pages") addEmptyPages(a.count);
    }
  };
  const newCardPage = () => {
    closePage();
    flushPageAdjustments();
    cur = { n: pages.length + 1, kind: "cards", set: setCode, pockets: [] };
    pages.push(cur);
  };
  const place = (slot) => {
    if (!cur || cur.kind !== "cards" || cur.pockets.length >= POCKETS) newCardPage();
    cur.pockets.push(slot);
    return { page: cur.n, pocket: cur.pockets.length };
  };
  const applyAll = (list) => {
    for (const a of list) {
      if (a.kind === "empty_pages") addEmptyPages(a.count);
      else if (a.kind === "empty_pockets") for (let i = 0; i < a.count; i++) place({ blank: true });
    }
  };

  applyAll(atStart);
  for (const s of binder.sets || []) {
    setCode = s.code;
    if (s.new_page !== false) closePage();
    for (const card of cardsBySet.get(s.code) || []) {
      where.set(card.number, place({ card }));
      applyAll(afterCard(card.number));
    }
    applyAll(afterSet(s.code));
  }
  closePage();
  // "after page N" where N is past the last used page: still honour it
  for (const [n, list] of [...afterPage].sort((a, b) => a[0] - b[0])) {
    while (pages.length < n) pages.push({ n: pages.length + 1, kind: "empty", set: null, pockets: [] });
    for (const a of list) if (a.kind === "empty_pages") addEmptyPages(a.count);
  }

  const used = pages.length;
  const capacity = Number(binder.pages) || used;
  return { pages, where, used, capacity, fits: used <= capacity };
}

/** On-screen order of a page's 4 pockets (reading order → grid positions). */
export function displayOrder(pockets, readingOrder = "rtl") {
  const p = pockets.length ? pockets : Array.from({ length: POCKETS }, () => ({ unused: true }));
  return readingOrder === "ltr" ? p : [p[1], p[0], p[3], p[2]];
}

/** Two-page spreads like a real binder: the first spread is the inside cover + page 1. */
export function spreads(totalPages) {
  const out = [[null, 1 <= totalPages ? 1 : null]];
  for (let left = 2; left <= totalPages; left += 2) out.push([left, left + 1 <= totalPages ? left + 1 : null]);
  return out;
}
export const spreadOfPage = (n) => (n <= 1 ? 0 : Math.floor(n / 2));

/** How many pages a set needs on its own (for "fits / won't fit"). */
export const pagesForCards = (count) => Math.ceil(count / POCKETS);
