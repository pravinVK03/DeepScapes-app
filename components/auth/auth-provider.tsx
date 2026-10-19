"use client";

import { Session, User } from "@supabase/supabase-js";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase-browser";

type AuthValue = { user: User | null; loading: boolean; signOut: () => Promise<void> };
const AuthContext = createContext<AuthValue>({ user: null, loading: true, signOut: async () => undefined });

async function initialize(session: Session | null) {
  if (!session) return;
  await fetch("/api/auth/initialize", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => undefined);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => Boolean(getBrowserSupabase()));
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    void supabase.auth.getSession().then(async ({ data }) => { await initialize(data.session); setSession(data.session); setLoading(false); });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => { void (async () => { await initialize(next); setSession(next); setLoading(false); })(); });
    return () => subscription.subscription.unsubscribe();
  }, []);
  const value = useMemo<AuthValue>(() => ({ user: session?.user ?? null, loading, signOut: async () => { await getBrowserSupabase()?.auth.signOut(); } }), [session, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
