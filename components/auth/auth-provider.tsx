"use client";

import { Session, User } from "@supabase/supabase-js";
import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { setScapeCacheOwner } from "@/lib/scape-store";

type AuthValue = { user: User | null; loading: boolean; profileReady: boolean; initializationFailed: boolean; signOut: () => Promise<void> };
const AuthContext = createContext<AuthValue>({ user: null, loading: true, profileReady: false, initializationFailed: false, signOut: async () => undefined });

type InitializationState = "ready" | "pending" | "failed";
type InitializationResult = { state: InitializationState; createdPersonalScape: boolean };
const initializationRequests = new Map<string, Promise<InitializationResult>>();

async function initialize(session: Session | null): Promise<InitializationResult> {
  if (!session) return { state: "ready", createdPersonalScape: false };
  const existing = initializationRequests.get(session.user.id);
  if (existing) return existing;
  const request: Promise<InitializationResult> = (async (): Promise<InitializationResult> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch("/api/auth/initialize", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        if (response.ok) {
          const data = await response.json().catch(() => ({})) as { profilePending?: boolean; scapeReady?: boolean; createdPersonalScape?: boolean };
          return { state: (data.profilePending ? "pending" : data.scapeReady ? "ready" : "failed") as InitializationState, createdPersonalScape: data.createdPersonalScape === true };
        }
        if (response.status === 401 || response.status === 403 || response.status === 429) return { state: "failed", createdPersonalScape: false };
      } catch { /* Retry once for a transient network interruption. */ }
    }
    return { state: "failed", createdPersonalScape: false };
  })();
  initializationRequests.set(session.user.id, request);
  try { return await request; } finally { initializationRequests.delete(session.user.id); }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => Boolean(getBrowserSupabase()));
  const [profileReady, setProfileReady] = useState(false);
  const [initializationFailed, setInitializationFailed] = useState(false);
  const requestVersion = useRef(0);
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const applySession = (next: Session | null) => {
      const version = ++requestVersion.current;
      setScapeCacheOwner(next?.user.id);
      setSession(next);
      setLoading(false);
      setProfileReady(!next);
      setInitializationFailed(false);
      if (!next) return;
      // Validate the durable profile and deterministic personal Scape for
      // every authenticated session. A client-side “ready” flag can outlive a
      // deleted or partial server row and previously produced empty dashboards.
      void initialize(next).then(({ state, createdPersonalScape }) => {
        if (createdPersonalScape) window.sessionStorage.setItem(`deepscapes-show-help:${next.user.id}`, "true");
        if (version === requestVersion.current) {
          // Do not show a newly authenticated user an empty dashboard before
          // their durable profile and personal Scape are confirmed. A failed
          // attempt stays recoverable rather than pretending setup succeeded.
          setProfileReady(state === "ready");
          setInitializationFailed(state === "failed");
        }
      });
    };
    void supabase.auth.getSession().then(({ data }) => applySession(data.session)).catch(() => { setLoading(false); setProfileReady(true); });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => applySession(next));
    return () => subscription.subscription.unsubscribe();
  }, []);
  const value = useMemo<AuthValue>(() => ({ user: session?.user ?? null, loading, profileReady, initializationFailed, signOut: async () => { requestVersion.current += 1; setScapeCacheOwner(undefined); setSession(null); setProfileReady(true); setInitializationFailed(false); await getBrowserSupabase()?.auth.signOut(); } }), [session, loading, profileReady, initializationFailed]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
