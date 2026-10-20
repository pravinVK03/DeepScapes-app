"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/ui/app-header";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { useAuth } from "@/components/auth/auth-provider";

export function AuthScreen({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isSignup = mode === "signup";
  const isRecovery = !isSignup && searchParams.get("reset") === "1";
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [busy, setBusy] = useState(false);
  const unavailable = !getBrowserSupabase();
  const destination = searchParams.get("next")?.startsWith("/") ? searchParams.get("next")! : "/scapes";

  useEffect(() => {
    if (user && !isRecovery) router.replace(destination);
  }, [destination, isRecovery, router, user]);

  async function resolveLoginEmail(value: string) {
    const candidate = value.trim();
    if (candidate.includes("@")) return candidate;
    const response = await fetch(`/api/auth/login?username=${encodeURIComponent(candidate)}`);
    const data = await response.json() as { email?: string };
    return data.email ?? "";
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setMessageTone("error");
    const supabase = getBrowserSupabase();
    if (!supabase) return setMessage("Add the Supabase publishable key to enable sign-in.");
    setBusy(true);
    try {
      if (isRecovery) {
        if (!user) {
          setMessage("This reset link is no longer active. Request a new password reset email.");
          return;
        }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) { setMessage(error.message); return; }
        setMessageTone("success");
        setMessage("Password updated. Opening your Scapes…");
        router.replace(destination);
        return;
      }

      if (isSignup) {
        const normalized = username.trim().toLowerCase();
        if (!/^[a-z0-9-]{3,32}$/.test(normalized)) {
          setMessage("Use 3–32 lowercase letters, numbers, or hyphens for your username.");
          return;
        }
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username: normalized }, emailRedirectTo: `${window.location.origin}/login` } });
        if (error) setMessage(error.message);
        else if (!data.session) { setMessageTone("success"); setMessage("Check your email to confirm your account, then return here to sign in."); }
        else router.replace(destination);
        return;
      }

      const loginEmail = await resolveLoginEmail(username);
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) setMessage("Username/email or password is incorrect.");
      else router.replace(destination);
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    setMessage("");
    setMessageTone("error");
    const supabase = getBrowserSupabase();
    if (!supabase) return setMessage("Add the Supabase publishable key to reset your password.");
    if (!username.trim()) return setMessage("Enter your username or email first.");
    setBusy(true);
    try {
      const loginEmail = await resolveLoginEmail(username);
      if (!loginEmail) { setMessage("We could not find an account with that username."); return; }
      const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, { redirectTo: `${window.location.origin}/login?reset=1` });
      if (error) { setMessage(error.message); return; }
      setMessageTone("success");
      setMessage("Check your email for a password reset link.");
    } catch {
      setMessage("The reset email could not be requested. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const supabase = getBrowserSupabase();
    if (!supabase) return setMessage("Add the Supabase publishable key to enable Google sign-in.");
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/login` } });
    if (error) setMessage(error.message);
  }

  return <main className="min-h-screen"><AppHeader compact /><section className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_440px] lg:py-20"><div className="max-w-xl pt-4"><p className="text-sm font-medium uppercase tracking-[.18em] text-[#718077]">Everything in one space</p><h1 className="mt-5 text-5xl font-medium tracking-[-.065em] sm:text-6xl">An Unified<br /><em className="font-serif font-normal">Project-Centric Workspace.</em></h1><p className="mt-6 max-w-md leading-7 text-[#718077]">Ideate. Organize. Collaborate.</p></div><form onSubmit={submit} className="rounded-[2rem] border border-[#e5e8e2] bg-white p-6 shadow-sm sm:p-8"><p className="text-sm text-[#718077]">{isRecovery ? "Secure your account" : isSignup ? "Create your account" : "Welcome back"}</p><h2 className="mt-2 text-3xl font-medium tracking-[-.05em]">{isRecovery ? "Choose a new password." : isSignup ? "Begin with your name." : "Return to your Scapes."}</h2>{!isRecovery && isSignup && <label className="mt-7 block text-sm font-medium">Username<input required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="your-name" className="mt-2 w-full rounded-xl border px-4 py-3 outline-none" /></label>}{!isRecovery && <label className="mt-5 block text-sm font-medium">{isSignup ? "Email" : "Username or email"}<input required value={isSignup ? email : username} onChange={(event) => isSignup ? setEmail(event.target.value) : setUsername(event.target.value)} autoComplete="username" className="mt-2 w-full rounded-xl border px-4 py-3 outline-none" /></label>}<label className="mt-5 block text-sm font-medium"><span className="flex items-center justify-between"><span>{isRecovery ? "New password" : "Password"}</span>{!isSignup && !isRecovery && <button type="button" onClick={() => void forgotPassword()} disabled={busy || unavailable} className="text-xs font-medium text-[#315443] underline-offset-4 transition hover:text-[#243f32] hover:underline disabled:opacity-50">Forgot password?</button>}</span><input required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={isSignup || isRecovery ? "new-password" : "current-password"} className="mt-2 w-full rounded-xl border px-4 py-3 outline-none" /></label>{message && <p role="status" aria-live="polite" className={`mt-4 text-sm ${messageTone === "success" ? "text-[#315443]" : "text-[#a95b54]"}`}>{message}</p>}<button disabled={busy || unavailable} className="mt-6 w-full rounded-xl bg-[#315443] py-3 text-sm font-medium text-white transition hover:bg-[#243f32] disabled:opacity-50">{busy ? "Working…" : isRecovery ? "Update password" : isSignup ? "Create account" : "Sign in"}</button>{!isRecovery && <><div className="my-5 flex items-center gap-3 text-xs text-[#8b968e]"><span className="h-px flex-1 bg-[#e5e8e2]" />or<span className="h-px flex-1 bg-[#e5e8e2]" /></div><button type="button" onClick={google} disabled={unavailable} className="w-full rounded-xl border border-[#dce1d9] py-3 text-sm font-medium transition hover:bg-[#f2f4ed] disabled:opacity-50">Continue with Google</button></>}<p className="mt-6 text-center text-sm text-[#718077]">{isRecovery ? "Remembered your password?" : isSignup ? "Already have an account?" : "New to DeepScapes?"} <Link className="font-medium text-[#315443]" href={isRecovery || isSignup ? "/login" : "/signup"}>{isRecovery || isSignup ? "Sign in" : "Create account"}</Link></p></form></section></main>;
}
