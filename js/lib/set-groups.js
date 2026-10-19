// ============================================================
//  lib/set-groups.js — groups sets for the set menu.
//  Automatic rule: sets that start with the same letters share a group
//  (BT1…BT27 → "BT"). A group with only one set stays a single entry.
//  Your changes from Admin → Set menu (settings.setGroups) win.
// ============================================================

export const autoKey = (code) => ((String(code).match(/^[A-Za-z]+/) || [String(code)])[0]).toUpperCase();

/**
 * sets: [{ code, name, set_group }] in release order
 * custom: { codes: { setCode → groupKey }, names: { groupKey → label } }   (from settings)
 * → [{ type: "item", code, label } | { type: "group", key, label, items: [{ code, label }] }]
 */
export function groupSets(sets, custom = {}) {
  const codes = custom.codes || {}, names = custom.names || {};
  const keyOf = (s) => (codes[s.code] || autoKey(s.code)).trim().toUpperCase();
  const members = new Map();
  for (const s of sets) {
    const k = keyOf(s);
    if (!members.has(k)) members.set(k, []);
    members.get(k).push(s);
  }
  const out = [], placed = new Set();
  for (const s of sets) {                       // keep release order: a group sits where its first set is
    const k = keyOf(s);
    if (placed.has(k)) continue;
    placed.add(k);
    const list = members.get(k);
    const item = (x) => ({ code: x.code, label: x.code + " · " + x.name });
    if (list.length === 1) { out.push({ type: "item", ...item(list[0]) }); continue; }
    const kinds = [...new Set(list.map((x) => x.set_group).filter(Boolean))];
    const label = names[k] || (kinds.length === 1 ? kinds[0] + " · " + k : k);
    out.push({ type: "group", key: k, label: label + " (" + list.length + ")", items: list.map(item) });
  }
  return out;
}
