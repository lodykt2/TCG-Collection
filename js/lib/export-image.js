// ============================================================
//  lib/export-image.js — the current view as JPG pictures
//  (50 cards per picture: 10 across, 5 down), like the old export.
// ============================================================
import { loadMany, download } from "./image-data.js";
import { shownPrint } from "../cards.js";
import { toast } from "../ui.js";
import { floatingProgress } from "../components/progress.js";

const COLS = 10, ROWS = 5, W = 250, H = 349, LABEL = 46, GAP = 8, PAD = 24, HEAD = 70;

export async function exportImages(game, cards, title) {
  const per = COLS * ROWS, pages = Math.ceil(cards.length / per);
  const bar = floatingProgress("Saving " + cards.length + " cards as " + pages + (pages === 1 ? " picture" : " pictures"));
  try {
  for (let p = 0; p < pages; p++) {
    const chunk = cards.slice(p * per, (p + 1) * per);
    const imgs = await loadMany(chunk.map((c) => shownPrint(c).image), { maxWidth: W },
      (done) => bar.set(p * per + done, cards.length, "Loading images"));
    bar.set(null, null, "Drawing picture " + (p + 1) + " of " + pages + "…");
    const rows = Math.ceil(chunk.length / COLS);
    const canvas = document.createElement("canvas");
    canvas.width = PAD * 2 + COLS * W + (COLS - 1) * GAP;
    canvas.height = HEAD + PAD + rows * (H + LABEL) + (rows - 1) * GAP + PAD;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111"; ctx.font = "bold 30px Arial";
    ctx.fillText(title + (pages > 1 ? "  ·  " + (p + 1) + " / " + pages : ""), PAD, PAD + 30);
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i], x = PAD + (i % COLS) * (W + GAP), y = HEAD + PAD + Math.floor(i / COLS) * (H + LABEL + GAP);
      if (imgs[i]) { const im = await toImage(imgs[i].dataUrl); ctx.drawImage(im, x, y, W, H); }
      else { ctx.fillStyle = "#eee"; ctx.fillRect(x, y, W, H); }
      ctx.fillStyle = "#111"; ctx.font = "bold 16px Arial"; ctx.fillText(clip(ctx, c.name, W - 34), x, y + H + 20);
      ctx.fillStyle = "#666"; ctx.font = "14px monospace"; ctx.fillText(c.number, x, y + H + 38);
      ctx.beginPath(); ctx.arc(x + W - 14, y + H + 22, 11, 0, Math.PI * 2);
      ctx.fillStyle = c.collected ? "#dcfce7" : "#fee2e2"; ctx.fill();
      ctx.fillStyle = c.collected ? "#166534" : "#991b1b"; ctx.font = "bold 14px Arial"; ctx.textAlign = "center";
      ctx.fillText(c.collected ? "✓" : "✕", x + W - 14, y + H + 27); ctx.textAlign = "left";
    }
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    download(game + "-cards" + (pages > 1 ? "-" + (p + 1) : "") + ".jpg", blob);
  }
  } finally { bar.close(); }
  toast("Saved " + pages + (pages === 1 ? " picture" : " pictures"));
}

function toImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
function clip(ctx, text, width) {
  let t = String(text);
  if (ctx.measureText(t).width <= width) return t;
  while (t.length > 1 && ctx.measureText(t + "…").width > width) t = t.slice(0, -1);
  return t + "…";
}
