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
  const resetComplete = !isSignup && searchParams.get("reset") === "complete";
  const verified = !isSignup && searchParams.get("verified") === "1";
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const [signupStage, setSignupStage] = useState<"email" | "profile">("email");
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState("🌿");
  const [appearancePreference, setAppearancePreference] = useState<"system" | "light" | "dark">("system");
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState<"sign-in" | "google" | false>(false);
  const unavailable = !getBrowserSupabase();
  const destination = searchParams.get("next")?.startsWith("/")
    ? searchParams.get("next")!
    : "/scapes";
  const profilePending = isSignup && Boolean(user) && user?.user_metadata.profile_completed !== true && typeof user?.user_metadata.username !== "string";
  const showingProfile = signupStage === "profile" || profilePending;

  function passwordIssue(value: string) {
    if (value.length < 5) return "Use at least 5 characters for your password.";
    return "";
  }

  async function chooseAvatar(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2_000_000) { setMessage("Choose an image under 2 MB."); return; }
    try {
      const image = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const size = 160;
      canvas.width = size; canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image preparation is unavailable.");
      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale; const height = image.height * scale;
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      image.close();
      setAvatar(canvas.toDataURL("image/jpeg", 0.78));
    } catch { setMessage("We could not prepare that profile image. Please try another image."); }
  }

  async function provisionProfile() {
    const supabase = getBrowserSupabase();
    const token = (await supabase?.auth.getSession())?.data.session?.access_token;
    if (!token) { setMessage("Your session expired. Open the email link again to finish creating your account."); return false; }
    const response = await fetch("/api/auth/initialize", { method: "POST", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => undefined);
    const data = await response?.json().catch(() => undefined) as { error?: string; profilePending?: boolean; scapeReady?: boolean } | undefined;
    if (!response?.ok || data?.profilePending || !data?.scapeReady) { setMessage(data?.error || "We could not finish creating your personal Scape. Please try again."); return false; }
    return true;
  }

  async function skipProfile() {
    const supabase = getBrowserSupabase();
    if (!supabase) return setMessage("Add the Supabase publishable key to continue.");
    const base = (user?.email || email).split("@")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 24) || "member";
    const fallbackUsername = `${base}-${crypto.randomUUID().slice(0, 6)}`;
    setMessage("");
    setPendingAction("Saving this for later…");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: {
        username: fallbackUsername,
        display_name: base,
        avatar: "",
        appearance_preference: "system",
        profile_completed: true,
        profile_skipped: true,
      } });
      if (error) { setMessage(error.message); return; }
      if (!(await provisionProfile())) return;
      setRedirecting("sign-in");
      router.replace(destination);
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }

  useEffect(() => {
    if (user && !isRecovery && !resetComplete && !verified && !(isSignup && showingProfile))
      router.replace(destination);
  }, [
    destination,
    isRecovery,
    resetComplete,
    router,
    user,
    verified,
    isSignup,
    showingProfile,
  ]);

  async function resolveLoginEmail(value: string) {
    const candidate = value.trim();
    if (candidate.includes("@")) return candidate;
    const response = await fetch(
      `/api/auth/login?username=${encodeURIComponent(candidate)}`,
    );
    const data = (await response.json()) as { email?: string };
    return data.email ?? "";
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setMessageTone("error");
    const supabase = getBrowserSupabase();
    if (!supabase)
      return setMessage("Add the Supabase publishable key to enable sign-in.");
    setPendingAction(
      isRecovery
          ? "Updating your password…"
          : isSignup
            ? showingProfile ? "Saving your profile…" : "Sending your confirmation link…"
            : "Signing you in…",
    );
    setBusy(true);
    try {
      if (isSignup && signupStage === "email" && !profilePending) {
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setMessage("Enter a valid email address."); return; }
        const response = await fetch("/api/auth/magic-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), destination }) }).catch(() => undefined);
        const data = await response?.json().catch(() => undefined) as { error?: string } | undefined;
        if (!response?.ok) { setMessage(data?.error || "We could not send the confirmation link. Please try again."); return; }
        setConfirmationSent(true);
        setMessageTone("success");
        setMessage("Check your email and follow the secure link to continue.");
        return;
      }
      if (isRecovery) {
        if (!user) {
          setMessage(
            "This reset link is no longer active. Request a new password reset email.",
          );
          return;
        }
        const issue = passwordIssue(password);
        if (issue) { setMessage(issue); return; }
        if (password !== passwordConfirmation) { setMessage("The passwords do not match."); return; }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          setMessage(error.message);
          return;
        }
        await supabase.auth.signOut();
        router.replace("/login?reset=complete");
        return;
      }

      if (isSignup) {
        if (!showingProfile) return;
        const normalized = username
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        if (!/^[a-z0-9-]{3,32}$/.test(normalized)) {
          setMessage("Use a name with at least 3 letters or numbers.");
          return;
        }
        const { error } = await supabase.auth.updateUser({ data: { username: normalized, display_name: displayName.trim() || normalized, avatar, appearance_preference: appearancePreference, profile_completed: true } });
        if (error) { setMessage(error.message); return; }
        if (!(await provisionProfile())) return;
        setRedirecting("sign-in");
        router.replace(destination);
        return;
      }

      const loginEmail = await resolveLoginEmail(username);
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });
      if (error) setMessage("Username/email or password is incorrect.");
      else {
        setRedirecting("sign-in");
        router.replace(destination);
      }
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }

  async function forgotPassword() {
    setMessage("");
    setMessageTone("error");
    const supabase = getBrowserSupabase();
    if (!supabase)
      return setMessage(
        "Add the Supabase publishable key to reset your password.",
      );
    if (!username.trim())
      return setMessage("Enter your username or email first.");
    setPendingAction("Sending your reset email…");
    setBusy(true);
    try {
      const loginEmail = await resolveLoginEmail(username);
      if (!loginEmail) {
        setMessage("We could not find an account with that username.");
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, {
        redirectTo: `${window.location.origin}/login?reset=1`,
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      setMessageTone("success");
      setMessage("Check your email for a password reset link.");
    } catch {
      setMessage("The reset email could not be requested. Please try again.");
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }

  async function google() {
    const supabase = getBrowserSupabase();
    if (!supabase)
      return setMessage(
        "Add the Supabase publishable key to enable Google sign-in.",
      );
    setRedirecting("google");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login` },
    });
    if (error) setRedirecting(false);
    if (error) setMessage(error.message);
  }

  if (redirecting)
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-5">
        <div role="status" aria-live="polite" className="text-center">
          <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-[#bfdbfe] border-t-[#1d4ed8]" />
          <p className="mt-4 text-sm text-[#718077]">{redirecting === "google" ? "Opening Google sign-in…" : "Signing you in…"}</p>
        </div>
      </main>
    );

  return (
    <main className="min-h-screen">
      <AppHeader compact />
      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_440px] lg:py-20">
        <div className="max-w-xl pt-4">
          <p className="text-sm font-medium uppercase tracking-[.18em] text-[#718077]">
            Everything in one space
          </p>
          <h1 className="mt-5 text-5xl font-medium tracking-[-.065em] sm:text-6xl">
            An Unified
            <br />
            <em className="font-serif font-normal">
              Project-Centric Workspace.
            </em>
          </h1>
          <p className="mt-6 max-w-md leading-7 text-[#718077]">
            Ideate. Organize. Collaborate.
          </p>
        </div>
        <form
          onSubmit={submit}
          key={isSignup ? (showingProfile ? "profile" : "email") : isRecovery ? "recovery" : "login"}
          className="auth-flow-card rounded-[2rem] border border-[#e5e8e2] bg-white p-6 shadow-sm sm:p-8"
        >
          <p className="text-sm text-[#718077]">
            {isRecovery
              ? "Secure your account"
              : isSignup
                ? showingProfile
                  ? "Make your profile yours"
                  : signupStage === "email"
                    ? "Create your account"
                    : "Make your profile yours"
                : "Welcome back,"}
          </p>
          <h2 className="mt-2 text-3xl font-medium tracking-[-.05em]">
            {isRecovery
              ? "Choose a new password."
              : isSignup
                ? showingProfile
                  ? "Finish your profile."
                  : signupStage === "email"
                    ? "Start with your email."
                    : "Finish your profile."
                : "Return to your Scapes."}
          </h2>
          {resetComplete && (
            <p role="status" className="mt-4 text-sm text-[#315443]">
              Password updated. Sign in with your new password.
            </p>
          )}
          {!isRecovery && (!isSignup || (signupStage === "email" && !profilePending)) && (
            <label className="mt-5 block text-sm font-medium">
              {isSignup ? "Email" : "Username or email"}
              <input
                required
                value={isSignup ? email : username}
                onChange={(event) => {
                  if (isSignup) { setEmail(event.target.value); setConfirmationSent(false); }
                  else setUsername(event.target.value);
                }}
                type={isSignup ? "email" : "text"}
                autoComplete={isSignup ? "email" : "username"}
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none"
              />
            </label>
          )}
          {!isSignup && <div className="mt-5">
            <label className="block text-sm font-medium">
              <span>{isRecovery ? "New password" : "Password"}</span>
              <span className="relative mt-2 block">
                <input
                  required
                  minLength={isSignup || isRecovery ? 5 : 6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    isSignup || isRecovery ? "new-password" : "current-password"
                  }
                  className="w-full rounded-xl border px-4 py-3 pr-12 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 grid w-12 place-items-center text-[#718077] transition hover:text-[#315443]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 fill-none stroke-current"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M2.5 12s3.4-5.5 9.5-5.5S21.5 12 21.5 12 18.1 17.5 12 17.5 2.5 12 2.5 12Z" />
                    {showPassword ? (
                      <circle cx="12" cy="12" r="2.5" />
                    ) : (
                      <>
                        <path d="m4 4 16 16" />
                        <path d="M9.9 6.8A8.9 8.9 0 0 1 12 6.5c6.1 0 9.5 5.5 9.5 5.5a18.4 18.4 0 0 1-3.2 3.6M6.3 8.2A18.3 18.3 0 0 0 2.5 12s3.4 5.5 9.5 5.5c.8 0 1.6-.1 2.3-.3" />
                      </>
                    )}
                  </svg>
                </button>
              </span>
            </label>
            {(isSignup || isRecovery) && (
              <label className="mt-4 block text-sm font-medium">
                Confirm password
                <span className="relative mt-2 block">
                  <input
                    required
                    minLength={5}
                    value={passwordConfirmation}
                    onChange={(event) => setPasswordConfirmation(event.target.value)}
                    type={showPasswordConfirmation ? "text" : "password"}
                    autoComplete="new-password"
                    className="w-full rounded-xl border px-4 py-3 pr-12 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordConfirmation((visible) => !visible)}
                    className="absolute inset-y-0 right-0 grid w-12 place-items-center text-[#718077] transition hover:text-[#315443]"
                    aria-label={showPasswordConfirmation ? "Hide confirmation password" : "Show confirmation password"}
                    aria-pressed={showPasswordConfirmation}
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8" aria-hidden="true">
                      <path d="M2.5 12s3.4-5.5 9.5-5.5S21.5 12 21.5 12 18.1 17.5 12 17.5 2.5 12 2.5 12Z" />
                      {showPasswordConfirmation ? <circle cx="12" cy="12" r="2.5" /> : <><path d="m4 4 16 16" /><path d="M9.9 6.8A8.9 8.9 0 0 1 12 6.5c6.1 0 9.5 5.5 9.5 5.5a18.4 18.4 0 0 1-3.2 3.6M6.3 8.2A18.3 18.3 0 0 0 2.5 12s3.4 5.5 9.5 5.5c.8 0 1.6-.1 2.3-.3" /></>}
                    </svg>
                  </button>
                </span>
                <span className="mt-2 block text-xs font-normal text-[#718077]">Use 5 or more characters.</span>
              </label>
            )}
            {!isSignup && !isRecovery && (
              <button
                type="button"
                onClick={() => void forgotPassword()}
                disabled={busy || unavailable}
                className="mt-2 text-xs font-medium text-[#315443] underline-offset-4 transition hover:text-[#243f32] hover:underline disabled:opacity-50"
              >
                Forgot password?
              </button>
            )}
          </div>}
          {isSignup && showingProfile && (
            <div className="mt-6 space-y-5">
              <label className="block text-sm font-medium">
                Username
                <input required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="your-name" autoComplete="username" className="mt-2 w-full rounded-xl border px-4 py-3 outline-none" />
              </label>
              <label className="block text-sm font-medium">
                Your name
                <input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="How should we call you?" autoComplete="name" className="mt-2 w-full rounded-xl border px-4 py-3 outline-none" />
              </label>
              <fieldset>
                <legend className="text-sm font-medium">Choose an avatar</legend>
                <div className="mt-2 flex flex-wrap gap-2">{["🌿", "✦", "☁️", "◉", "◆", "☼"].map((option) => <button key={option} type="button" onClick={() => setAvatar(option)} aria-label={`Use ${option} as your avatar`} aria-pressed={avatar === option} className={`grid h-11 w-11 place-items-center rounded-full border text-lg transition hover:-translate-y-0.5 ${avatar === option ? "border-[#315443] bg-[#edf0df]" : "border-[#dce1d9] bg-white"}`}>{option}</button>)}</div>
                <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#dce1d9] px-3 py-2 text-sm text-[#718077] hover:border-[#315443] hover:text-[#315443]">
                  <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-[#edf0df] text-base" style={avatar.startsWith("data:") ? { backgroundImage: `url(${avatar})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>{avatar.startsWith("data:") ? "" : avatar}</span>
                  Upload a profile image
                  <input type="file" accept="image/*" onChange={(event) => void chooseAvatar(event.target.files?.[0])} className="hidden" />
                </label>
              </fieldset>
              <label className="block text-sm font-medium">
                Appearance preference
                <select value={appearancePreference} onChange={(event) => setAppearancePreference(event.target.value as typeof appearancePreference)} className="mt-2 w-full rounded-xl border bg-white px-4 py-3 outline-none">
                  <option value="system">Follow my device</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
            </div>
          )}
          {message && (
            <p
              role="status"
              aria-live="polite"
              className={`mt-4 text-sm ${messageTone === "success" ? "text-[#315443]" : "text-[#a95b54]"}`}
            >
              {message}
            </p>
          )}
          <button
            disabled={busy || unavailable}
            className="auth-primary-action mt-6 w-full rounded-xl bg-[#315443] py-3 text-sm font-medium text-white transition hover:bg-[#243f32] disabled:opacity-50"
          >
            <span>{busy
              ? pendingAction
              : isRecovery
                ? "Update password"
              : isSignup
                  ? showingProfile ? "Create account" : confirmationSent ? "Resend confirmation link" : "Continue"
                  : "Sign in"}</span><span className="auth-action-arrow" aria-hidden="true">→</span>
          </button>
          {isSignup && showingProfile && (
            <button type="button" onClick={() => void skipProfile()} disabled={busy || unavailable} className="auth-inline-link mx-auto mt-4 block text-sm text-[#718077] hover:text-[#315443] disabled:opacity-50">
              Skip for now
            </button>
          )}
          {isSignup && signupStage === "profile" && !profilePending && (
            <button type="button" onClick={() => { setMessage(""); setSignupStage("email"); }} className="auth-inline-link mx-auto mt-4 block text-sm text-[#718077] hover:text-[#315443]">
              Back
            </button>
          )}
          {!isRecovery && (!isSignup || (signupStage === "email" && !profilePending)) && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-[#8b968e]">
                <span className="h-px flex-1 bg-[#e5e8e2]" />
                or
                <span className="h-px flex-1 bg-[#e5e8e2]" />
              </div>
              <button
                type="button"
                onClick={google}
                disabled={unavailable}
                className="google-auth-button w-full rounded-xl border border-[#dce1d9] bg-white py-3 text-sm font-medium text-[#17231d] transition hover:-translate-y-0.5 hover:border-[#315443] hover:bg-[#edf0df] hover:shadow-sm disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>Continue with Google</span><span className="auth-action-arrow" aria-hidden="true">→</span>
              </button>
            </>
          )}
          <p className="mt-6 text-center text-sm text-[#718077]">
            {isRecovery
              ? "Remembered your password?"
              : isSignup
                ? "Already have an account?"
                : "New to DeepScapes?"}{" "}
            <Link
              className="auth-inline-link font-medium text-[#315443]"
              href={isRecovery || isSignup ? "/login" : "/signup"}
            >
              {isRecovery || isSignup ? "Sign in" : "Create account"}
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}
