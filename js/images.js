// ============================================================
//  images.js — card images.
//  Images load straight from the card sites. If a site refuses
//  (Bandai's Gundam site can), the image is fetched through your
//  "image" Edge Function instead, and if that fails too, the card
//  number is shown in its place.
// ============================================================
import { SUPABASE_URL } from "./config.js";
import { h } from "./ui.js";

export const proxied = (url) => SUPABASE_URL + "/functions/v1/image?url=" + encodeURIComponent(url);

/** <img> with automatic fallback: direct → through the proxy → a labelled placeholder. */
export function cardImage(print, { className = "card-img", alt = "" } = {}) {
  const box = h("span", { class: className });
  if (!print || !print.image) { box.append(h("span", { class: "img-missing" }, print ? print.id : "")); return box; }
  const img = h("img", { src: print.image, alt, loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
  let triedProxy = false;
  img.addEventListener("error", () => {
    if (!triedProxy) { triedProxy = true; img.src = proxied(print.image); return; }
    img.replaceWith(h("span", { class: "img-missing" }, print.id));
  });
  box.append(img);
  return box;
}
