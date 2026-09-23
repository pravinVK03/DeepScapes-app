"use client";
import { useSyncExternalStore } from "react";
import { Scape, starterScapes } from "./mock-data";
const key = "deepscapes-data";
const changeEvent = "deepscapes-change";
let cachedRaw: string | null | undefined;
let cachedScapes: Scape[] = starterScapes;

export function getScapes(): Scape[] {
  if (typeof window === "undefined") return starterScapes;
  const saved = localStorage.getItem(key);
  if (saved === cachedRaw) return cachedScapes;
  cachedRaw = saved;
  cachedScapes = saved ? JSON.parse(saved) as Scape[] : starterScapes;
  return cachedScapes;
}

export function saveScapes(scapes: Scape[]) {
  cachedScapes = scapes;
  cachedRaw = JSON.stringify(scapes);
  localStorage.setItem(key, cachedRaw);
  window.dispatchEvent(new Event(changeEvent));
}
export function getScape(id: string) { return getScapes().find((scape) => scape.id === id); }
export function saveScape(next: Scape) {
  saveScapes(getScapes().map((scape) => scape.id === next.id ? next : scape));
  return persistScape(next);
}
export function addScape(next: Scape) {
  saveScapes([next, ...getScapes()]);
  return persistScape(next);
}
export function newId(prefix: string) { return `${prefix}-${globalThis.crypto.randomUUID()}`; }
export async function persistScape(scape: Scape) {
  const response = await fetch("/api/scapes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scape),
  });
  if (!response.ok) throw new Error("DeepScapes could not save this change. Check your database connection and try again.");
}
export async function loadRemoteScapes() { const response = await fetch("/api/scapes").catch(() => undefined); if (!response?.ok) return []; const data = await response.json() as { scapes: Scape[] }; return data.scapes; }
function subscribe(onStoreChange: () => void) { window.addEventListener(changeEvent, onStoreChange); return () => window.removeEventListener(changeEvent, onStoreChange); }
const serverSnapshot: Scape[] = [];
export function useScapes() { return useSyncExternalStore(subscribe, getScapes, () => serverSnapshot); }
export function useScape(id: string) { const scapes = useScapes(); return scapes.find((scape) => scape.id === id); }
export function deleteScape(id: string) { saveScapes(getScapes().filter((scape) => scape.id !== id)); void fetch(`/api/scapes?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined); }
