"use client";

import { Session, User } from "@supabase/supabase-js";
import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase-browser";

type AuthValue = { user: User | null; loading: boolean; profileReady: boolean; signOut: () => Promise<void> };
const AuthContext = createContext<AuthValue>({ user: null, loading: true, profileReady: false, signOut: async () => undefined });

const initializationRequests = new Map<string, Promise<boolean>>();

async function initialize(session: Session | null) {
  if (!session) return true;
  const existing = initializationRequests.get(session.user.id);
  if (existing) return existing;
  const request = (async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch("/api/auth/initialize", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        if (response.ok) return true;
        if (response.status === 401 || response.status === 403 || response.status === 429) return false;
      } catch { /* Retry once for a transient network interruption. */ }
    }
    return false;
  })();
  initializationRequests.set(session.user.id, request);
  try { return await request; } finally { initializationRequests.delete(session.user.id); }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => Boolean(getBrowserSupabase()));
  const [profileReady, setProfileReady] = useState(false);
  const requestVersion = useRef(0);
  const activeUserId = useRef<string | undefined>(undefined);
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const applySession = (next: Session | null) => {
      const version = ++requestVersion.current;
      const nextUserId = next?.user.id;
      const isSameUser = activeUserId.current === nextUserId;
      activeUserId.current = nextUserId;
      setSession(next);
      setLoading(false);
      setProfileReady(!next);
      if (!next) return;
      // Token refreshes and returning to a browser tab are not a new sign-in.
      // Keep the current view usable and initialize only once per browser session.
      const readyKey = `deepscapes-profile-ready:${next.user.id}`;
      const alreadyReady = isSameUser || window.sessionStorage.getItem(readyKey) === "true";
      if (alreadyReady) { setProfileReady(true); return; }
      void initialize(next).then((ready) => {
        if (ready) window.sessionStorage.setItem(readyKey, "true");
        if (version === requestVersion.current) setProfileReady(true);
      });
    };
    void supabase.auth.getSession().then(({ data }) => applySession(data.session)).catch(() => { setLoading(false); setProfileReady(true); });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => applySession(next));
    return () => subscription.subscription.unsubscribe();
  }, []);
  const value = useMemo<AuthValue>(() => ({ user: session?.user ?? null, loading, profileReady, signOut: async () => { requestVersion.current += 1; activeUserId.current = undefined; setSession(null); setProfileReady(true); await getBrowserSupabase()?.auth.signOut(); } }), [session, loading, profileReady]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
