// ============================================================
//  lib/image-data.js — turns a card image into something a PDF or
//  picture can contain. Always goes through your image function,
//  because browsers only let pages draw other sites' images into
//  files when the site gives permission (the function adds it).
// ============================================================
import { proxied } from "../images.js";

/** → { dataUrl } as JPEG, optionally gray, at most maxWidth pixels wide. null if it can't be loaded. */
export async function loadImageData(url, { grayscale = false, maxWidth = 750 } = {}) {
  if (!url) return null;
  try {
    const res = await fetch(proxied(url));
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const scale = Math.min(1, maxWidth / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (grayscale) {
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      ctx.putImageData(img, 0, 0);
    }
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.85) };
  } catch (_) {
    return null;            // the sheet shows a labelled box instead
  }
}

/** Loads many images, a few at a time, reporting progress. Keeps the input order. */
export async function loadMany(urls, options, onProgress) {
  const out = new Array(urls.length).fill(null);
  let done = 0;
  const next = (() => { let i = 0; return () => (i < urls.length ? i++ : -1); })();
  async function worker() {
    for (let i = next(); i !== -1; i = next()) {
      out[i] = await loadImageData(urls[i], options);
      done++; onProgress && onProgress(done, urls.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, urls.length) }, worker));
  return out;
}

/** Starts a download of a Blob or data URL. */
export function download(fileName, blobOrUrl) {
  const url = typeof blobOrUrl === "string" ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const a = document.createElement("a");
  a.href = url; a.download = fileName; document.body.append(a); a.click(); a.remove();
  if (typeof blobOrUrl !== "string") setTimeout(() => URL.revokeObjectURL(url), 5000);
}
