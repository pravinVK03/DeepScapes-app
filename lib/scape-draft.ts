"use client";

const thumbnailKey = "deepscapes-draft-thumbnail";
let inMemoryThumbnail: string | undefined;

// Mobile privacy modes and storage-quota limits can reject sessionStorage.
// Keep the draft in memory as a safe fallback so creating a Scape never stalls.
export function saveDraftThumbnail(thumbnail: string) {
  inMemoryThumbnail = thumbnail || undefined;
  try {
    if (thumbnail) window.sessionStorage.setItem(thumbnailKey, thumbnail);
    else window.sessionStorage.removeItem(thumbnailKey);
  } catch { /* The in-memory draft is enough for the next client-side route. */ }
}

export function takeDraftThumbnail() {
  let saved: string | null = null;
  try {
    saved = window.sessionStorage.getItem(thumbnailKey);
    window.sessionStorage.removeItem(thumbnailKey);
  } catch { /* Use the in-memory draft below. */ }
  const thumbnail = saved || inMemoryThumbnail || "";
  inMemoryThumbnail = undefined;
  return thumbnail;
}
