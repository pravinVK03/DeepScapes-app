"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/ui/app-header";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { useAuth } from "@/components/auth/auth-provider";

export function AuthScreen({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter(); const searchParams = useSearchParams(); const { user } = useAuth(); const isSignup = mode === "signup";
  const [username, setUsername] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const unavailable = !getBrowserSupabase();
  const destination = searchParams.get("next")?.startsWith("/") ? searchParams.get("next")! : "/scapes";
  useEffect(() => { if (user) router.replace(destination); }, [destination, router, user]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage(""); const supabase = getBrowserSupabase();
    if (!supabase) return setMessage("Add the Supabase publishable key to enable sign-in.");
    setBusy(true);
    if (isSignup) {
      const normalized = username.trim().toLowerCase();
      if (!/^[a-z0-9-]{3,32}$/.test(normalized)) { setBusy(false); return setMessage("Use 3–32 lowercase letters, numbers, or hyphens for your username."); }
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username: normalized }, emailRedirectTo: `${window.location.origin}/login` } });
      if (error) setMessage(error.message); else if (!data.session) setMessage("Check your email to confirm your account, then return here to sign in."); else router.replace(destination);
    } else {
      let loginEmail = username.trim();
      if (!loginEmail.includes("@")) { const response = await fetch(`/api/auth/login?username=${encodeURIComponent(loginEmail)}`); const data = await response.json() as { email?: string }; loginEmail = data.email ?? ""; }
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) setMessage("Username/email or password is incorrect."); else router.replace(destination);
    }
    setBusy(false);
  }
  async function google() { const supabase = getBrowserSupabase(); if (!supabase) return setMessage("Add the Supabase publishable key to enable Google sign-in."); const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/login` } }); if (error) setMessage(error.message); }
  return <main className="min-h-screen"><AppHeader compact/><section className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_440px] lg:py-20"><div className="max-w-xl pt-4"><p className="text-sm font-medium uppercase tracking-[.18em] text-[#718077]">Everything in one space</p><h1 className="mt-5 text-5xl font-medium tracking-[-.065em] sm:text-6xl">A calm home for<br/><em className="font-serif font-normal">your project world.</em></h1><p className="mt-6 max-w-md leading-7 text-[#718077]">Create a personal Scape, then invite the people who should help shape it.</p></div><form onSubmit={submit} className="rounded-[2rem] border border-[#e5e8e2] bg-white p-6 shadow-sm sm:p-8"><p className="text-sm text-[#718077]">{isSignup ? "Create your account" : "Welcome back"}</p><h2 className="mt-2 text-3xl font-medium tracking-[-.05em]">{isSignup ? "Begin with your name." : "Return to your Scapes."}</h2>{isSignup && <label className="mt-7 block text-sm font-medium">Username<input required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="your-name" className="mt-2 w-full rounded-xl border px-4 py-3 outline-none"/></label>}<label className="mt-5 block text-sm font-medium">{isSignup ? "Email" : "Username or email"}<input required value={isSignup ? email : username} onChange={(event) => isSignup ? setEmail(event.target.value) : setUsername(event.target.value)} autoComplete="username" className="mt-2 w-full rounded-xl border px-4 py-3 outline-none"/></label><label className="mt-5 block text-sm font-medium">Password<input required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={isSignup ? "new-password" : "current-password"} className="mt-2 w-full rounded-xl border px-4 py-3 outline-none"/></label>{message && <p className="mt-4 text-sm text-[#a95b54]">{message}</p>}<button disabled={busy || unavailable} className="mt-6 w-full rounded-xl bg-[#315443] py-3 text-sm font-medium text-white disabled:opacity-50">{busy ? "Working…" : isSignup ? "Create account" : "Sign in"}</button><div className="my-5 flex items-center gap-3 text-xs text-[#8b968e]"><span className="h-px flex-1 bg-[#e5e8e2]"/>or<span className="h-px flex-1 bg-[#e5e8e2]"/></div><button type="button" onClick={google} disabled={unavailable} className="w-full rounded-xl border border-[#dce1d9] py-3 text-sm font-medium disabled:opacity-50">Continue with Google</button><p className="mt-6 text-center text-sm text-[#718077]">{isSignup ? "Already have an account?" : "New to DeepScapes?"} <Link className="font-medium text-[#315443]" href={isSignup ? "/login" : "/signup"}>{isSignup ? "Sign in" : "Create account"}</Link></p></form></section></main>;
}
