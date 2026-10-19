// ============================================================
//  lib/pdf.js — lays out cards on printable sheets.
//  Pure layout: it receives the PDF library and ready images,
//  so it can be tested without a browser.
//
//  Full cards:   real card size 63 × 88 mm, 3 × 3 per sheet.
//  Placeholders: same pocket-sized cells, small grayscale image
//                with name, card number and rarity underneath.
// ============================================================

export const PAPER = { A4: [210, 297], Letter: [215.9, 279.4] };
export const CARD_W = 63, CARD_H = 88, PER_SHEET = 9;

export function sheetLayout(paper = "A4") {
  const [W, H] = PAPER[paper] || PAPER.A4;
  return { W, H, cols: 3, rows: 3, x0: (W - 3 * CARD_W) / 2, y0: (H - 3 * CARD_H) / 2 };
}

export const sheetsNeeded = (count) => Math.ceil(count / PER_SHEET);

/**
 * items: [{ name, number, rarity, where?, dataUrl? }]
 * options: { mode: "full" | "placeholder", paper: "A4" | "Letter", cutLines: boolean }
 */
export function buildPdf(jsPDF, items, { mode = "full", paper = "A4", cutLines = true } = {}) {
  const L = sheetLayout(paper);
  const doc = new jsPDF({ unit: "mm", format: paper === "Letter" ? "letter" : "a4", orientation: "portrait" });
  const total = sheetsNeeded(items.length);

  items.forEach((it, i) => {
    const pos = i % PER_SHEET;
    if (pos === 0 && i > 0) doc.addPage();
    const x = L.x0 + (pos % 3) * CARD_W, y = L.y0 + Math.floor(pos / 3) * CARD_H;
    if (pos === 0) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(150);
      doc.text("Sheet " + (Math.floor(i / PER_SHEET) + 1) + " of " + total, L.W / 2, L.H - 5, { align: "center" });
    }
    if (mode === "full") drawFull(doc, it, x, y); else drawPlaceholder(doc, it, x, y);
    if (cutLines) { doc.setDrawColor(160); doc.setLineWidth(0.2); doc.rect(x, y, CARD_W, CARD_H); }
  });
  return doc;
}

function drawFull(doc, it, x, y) {
  if (it.dataUrl) { doc.addImage(it.dataUrl, "JPEG", x, y, CARD_W, CARD_H, undefined, "FAST"); return; }
  missingImage(doc, x + 4, y + 4, CARD_W - 8, CARD_H - 8, it);
}

function drawPlaceholder(doc, it, x, y) {
  const imgW = CARD_W * 0.64, imgH = imgW * (CARD_H / CARD_W);
  const ix = x + (CARD_W - imgW) / 2, iy = y + 7;
  if (it.where) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(120);
    doc.text(fit(doc, it.where, CARD_W - 6), x + CARD_W / 2, y + 4.5, { align: "center" });
  }
  if (it.dataUrl) doc.addImage(it.dataUrl, "JPEG", ix, iy, imgW, imgH, undefined, "FAST");
  else missingImage(doc, ix, iy, imgW, imgH, it);
  doc.setTextColor(20); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text(fit(doc, it.name, CARD_W - 6), x + CARD_W / 2, iy + imgH + 6, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(90);
  doc.text([it.number, it.rarity].filter(Boolean).join(" · "), x + CARD_W / 2, iy + imgH + 10.5, { align: "center" });
}

function missingImage(doc, x, y, w, h, it) {
  doc.setDrawColor(190); doc.setFillColor(235); doc.setLineWidth(0.2); doc.rect(x, y, w, h, "FD");
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(140);
  doc.text(it.number || "", x + w / 2, y + h / 2, { align: "center" });
}

/** Shortens text with "…" until it fits the width (mm). */
function fit(doc, text, width) {
  let t = String(text || "");
  if (doc.getTextWidth(t) <= width) return t;
  while (t.length > 1 && doc.getTextWidth(t + "…") > width) t = t.slice(0, -1);
  return t + "…";
}
