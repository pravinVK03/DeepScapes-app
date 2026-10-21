"use client";
import { useSyncExternalStore } from "react";
import { Scape, starterScapes } from "./mock-data";
import { getBrowserSupabase } from "./supabase-browser";
const key = "deepscapes-data";
const changeEvent = "deepscapes-change";
let cachedRaw: string | null | undefined;
let cachedScapes: Scape[] = starterScapes;
let remoteScapesRequest: Promise<Scape[] | undefined> | undefined;
let lastRemoteScapesSync = 0;

export function getScapes(): Scape[] {
  if (typeof window === "undefined") return starterScapes;
  let saved: string | null;
  try { saved = localStorage.getItem(key); } catch { return cachedScapes; }
  if (saved === cachedRaw) return cachedScapes;
  try {
    const parsed = saved ? JSON.parse(saved) : starterScapes;
    if (!Array.isArray(parsed)) throw new Error("Saved Scapes are not an array");
    cachedRaw = saved;
    cachedScapes = parsed as Scape[];
  } catch {
    // A stale or partially-written browser cache should never prevent the app
    // from opening. The server copy remains the source of truth.
    cachedRaw = saved;
    cachedScapes = starterScapes;
    try { localStorage.removeItem(key); } catch { /* Storage may be unavailable. */ }
  }
  return cachedScapes;
}

export function saveScapes(scapes: Scape[]) {
  cachedScapes = scapes;
  cachedRaw = JSON.stringify(scapes);
  try { localStorage.setItem(key, cachedRaw); } catch { /* Continue with in-memory data and cloud persistence. */ }
  window.dispatchEvent(new Event(changeEvent));
}
export function getScape(id: string) { return getScapes().find((scape) => scape.id === id); }
export function saveScape(next: Scape) {
  const stamped = { ...next, updatedAt: new Date().toISOString() };
  saveScapes(getScapes().map((scape) => scape.id === stamped.id ? stamped : scape));
  return persistScape(stamped);
}
export function addScape(next: Scape) {
  const now = new Date().toISOString();
  const stamped = { ...next, createdAt: next.createdAt ?? now, updatedAt: next.updatedAt ?? now };
  saveScapes([stamped, ...getScapes()]);
  return persistScape(stamped);
}
export function newId(prefix: string) { return `${prefix}-${globalThis.crypto.randomUUID()}`; }
export async function persistScape(scape: Scape) {
  const token = (await getBrowserSupabase()?.auth.getSession())?.data.session?.access_token;
  const response = await fetch("/api/scapes", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(scape),
  });
  if (!response.ok) throw new Error("DeepScapes could not save this change. Check your database connection and try again.");
}
export async function loadRemoteScapes({ force = false }: { force?: boolean } = {}): Promise<Scape[] | undefined> {
  // Route changes can mount the home screen more than once. Share an in-flight
  // request and reuse a very recent result so navigation never creates a burst
  // of identical Supabase reads.
  if (!force && lastRemoteScapesSync && Date.now() - lastRemoteScapesSync < 15_000) return cachedScapes;
  if (remoteScapesRequest) return remoteScapesRequest;
  remoteScapesRequest = (async () => {
    const token = (await getBrowserSupabase()?.auth.getSession())?.data.session?.access_token;
    const response = await fetch("/api/scapes", { headers: token ? { Authorization: `Bearer ${token}` } : {} }).catch(() => undefined);
    if (!response?.ok) return undefined;
    try {
      const data = await response.json() as { scapes?: Scape[] };
      if (!Array.isArray(data.scapes)) return undefined;
      lastRemoteScapesSync = Date.now();
      return data.scapes;
    } catch {
      return undefined;
    }
  })();
  try { return await remoteScapesRequest; } finally { remoteScapesRequest = undefined; }
}
function subscribe(onStoreChange: () => void) { window.addEventListener(changeEvent, onStoreChange); return () => window.removeEventListener(changeEvent, onStoreChange); }
const serverSnapshot: Scape[] = [];
export function useScapes() { return useSyncExternalStore(subscribe, getScapes, () => serverSnapshot); }
export function useScape(id: string) { const scapes = useScapes(); return scapes.find((scape) => scape.id === id); }
export function deleteScape(id: string) { saveScapes(getScapes().filter((scape) => scape.id !== id)); void getBrowserSupabase()?.auth.getSession().then(({ data }) => fetch(`/api/scapes?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {} }).catch(() => undefined)); }
