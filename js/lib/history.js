// ============================================================
//  lib/history.js — rebuilds "owned prints over time" from the
//  changelog's daily totals. It starts from today's real count and
//  walks backwards, so it always ends exactly at what you own now.
// ============================================================

const DAY = 86400000;
const iso = (d) => new Date(d).toISOString().slice(0, 10);

/**
 * rows:    [{ game, day: "YYYY-MM-DD", added, removed, restored }]   (owned_daily view)
 * current: { game → owned prints today }
 * days:    how many days to show (ending today)
 * → { game → { points: [{ day, value }], last30, months: [{ month: "YYYY-MM", added }] } }
 */
export function buildHistory(rows, current, { days = 90, today = Date.now(), months = 6 } = {}) {
  const out = {};
  for (const game of Object.keys(current)) {
    const net = new Map(), added = new Map();
    for (const r of rows) if (r.game === game) {
      const d = String(r.day).slice(0, 10);
      net.set(d, (net.get(d) || 0) + Number(r.added) - Number(r.removed) + Number(r.restored || 0));
      added.set(d, (added.get(d) || 0) + Number(r.added));
    }
    // walk back from today: the value at the end of a day = today's count minus everything that happened after it
    const points = [];
    let value = Number(current[game]) || 0;
    for (let i = 0; i < days; i++) {
      const d = iso(today - i * DAY);
      points.push({ day: d, value });
      value -= net.get(d) || 0;
    }
    points.reverse();
    const start30 = iso(today - 29 * DAY);
    let last30 = 0;
    for (const [d, n] of net) if (d >= start30 && d <= iso(today)) last30 += n;
    const monthList = [];
    const now = new Date(today);
    for (let m = months - 1; m >= 0; m--) {
      const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
      const key = dt.toISOString().slice(0, 7);
      let n = 0;
      for (const [d, a] of added) if (d.startsWith(key)) n += a;
      monthList.push({ month: key, added: n });
    }
    out[game] = { points, last30, months: monthList };
  }
  return out;
}
