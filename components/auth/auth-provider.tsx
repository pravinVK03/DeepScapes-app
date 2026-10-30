"use client";

import { Session, User } from "@supabase/supabase-js";
import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase-browser";

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
    for (let attempt = 0; attempt < 2; attempt += 1) {
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
      setSession(next);
      setLoading(false);
      setProfileReady(!next);
      setInitializationFailed(false);
      if (!next) return;
      // A completed profile is cached, but a pending profile must be checked
      // again after updateUser changes its metadata during signup.
      // v2 also verifies the default Scape. The earlier key only meant the
      // profile existed, leaving partially provisioned accounts unrepaired.
      const readyKey = `deepscapes-profile-ready:v2:${next.user.id}`;
      const isComplete = next.user.user_metadata?.profile_completed === true || Boolean(next.user.user_metadata?.username);
      const alreadyReady = window.sessionStorage.getItem(readyKey) === "true" || (isComplete && window.localStorage.getItem(readyKey) === "true");
      if (alreadyReady) { setProfileReady(true); return; }
      void initialize(next).then(({ state, createdPersonalScape }) => {
        if (state === "ready") {
          window.sessionStorage.setItem(readyKey, "true");
          window.localStorage.setItem(readyKey, "true");
        }
        if (createdPersonalScape) window.sessionStorage.setItem(`deepscapes-show-help:${next.user.id}`, "true");
        if (version === requestVersion.current) {
          // Do not show a newly authenticated user an empty dashboard before
          // their durable profile and personal Scape are confirmed. A failed
          // attempt stays recoverable rather than pretending setup succeeded.
          setProfileReady(state !== "failed");
          setInitializationFailed(state === "failed");
        }
      });
    };
    void supabase.auth.getSession().then(({ data }) => applySession(data.session)).catch(() => { setLoading(false); setProfileReady(true); });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => applySession(next));
    return () => subscription.subscription.unsubscribe();
  }, []);
  const value = useMemo<AuthValue>(() => ({ user: session?.user ?? null, loading, profileReady, initializationFailed, signOut: async () => { requestVersion.current += 1; setSession(null); setProfileReady(true); setInitializationFailed(false); await getBrowserSupabase()?.auth.signOut(); } }), [session, loading, profileReady, initializationFailed]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
