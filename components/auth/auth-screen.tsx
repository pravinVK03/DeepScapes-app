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
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState<"sign-in" | "google" | false>(false);
  const unavailable = !getBrowserSupabase();
  const destination = searchParams.get("next")?.startsWith("/")
    ? searchParams.get("next")!
    : "/scapes";
  const verifyingEmail = Boolean(verificationEmail);

  function passwordIssue(value: string) {
    if (value.length < 10) return "Use at least 10 characters for your password.";
    if (!/[a-zA-Z]/.test(value) || !/\d/.test(value)) return "Use a password with at least one letter and one number.";
    return "";
  }

  useEffect(() => {
    if (user && !isRecovery && !resetComplete && !verified && !verifyingEmail)
      router.replace(destination);
  }, [
    destination,
    isRecovery,
    resetComplete,
    router,
    user,
    verified,
    verifyingEmail,
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
      verifyingEmail
        ? "Confirming your account…"
        : isRecovery
          ? "Updating your password…"
          : isSignup
            ? "Signing you up…"
            : "Signing you in…",
    );
    setBusy(true);
    try {
      if (verifyingEmail) {
        const { error } = await supabase.auth.verifyOtp({
          email: verificationEmail,
          token: verificationCode.trim(),
          type: "email",
        });
        if (error) {
          setMessage(error.message);
          return;
        }
        await supabase.auth.signOut();
        router.replace("/login?verified=1");
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
        const normalized = username
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        if (!/^[a-z0-9-]{3,32}$/.test(normalized)) {
          setMessage("Use a name with at least 3 letters or numbers.");
          return;
        }
        const issue = passwordIssue(password);
        if (issue) { setMessage(issue); return; }
        if (password !== passwordConfirmation) { setMessage("The passwords do not match."); return; }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: normalized },
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });
        if (error) setMessage(error.message);
        else if (data.session) {
          await supabase.auth.signOut();
          setMessage(
            "Email verification is not enabled yet. Enable Confirm email in Supabase before accepting sign-ups.",
          );
        } else {
          setVerificationEmail(email);
          setMessageTone("success");
          setMessage("Enter the verification code sent to your email.");
        }
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

  if (verifyingEmail)
    return (
      <main className="min-h-screen">
        <AppHeader compact />
        <section className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_440px] lg:py-20">
          <div className="max-w-xl pt-4">
            <p className="text-sm font-medium uppercase tracking-[.18em] text-[#718077]">
              Everything in one space
            </p>
            <h1 className="mt-5 text-5xl font-medium tracking-[-.065em] sm:text-6xl">
              One last
              <br />
              <em className="font-serif font-normal">step to get started.</em>
            </h1>
          </div>
          <form
            onSubmit={submit}
            className="rounded-[2rem] border border-[#e5e8e2] bg-white p-6 shadow-sm sm:p-8"
          >
            <p className="text-sm text-[#718077]">Confirm your email</p>
            <h2 className="mt-2 text-3xl font-medium tracking-[-.05em]">
              Enter your verification code.
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#718077]">
              We sent a code to {verificationEmail}. Enter it below to confirm
              your account.
            </p>
            <label className="mt-6 block text-sm font-medium">
              Verification code
              <input
                required
                value={verificationCode}
                onChange={(event) =>
                  setVerificationCode(event.target.value.replace(/\s/g, ""))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9A-Za-z]+"
                placeholder="Enter code"
                className="mt-2 w-full rounded-xl border px-4 py-3 tracking-[.2em] outline-none"
              />
            </label>
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
              className="mt-6 w-full rounded-xl bg-[#315443] py-3 text-sm font-medium text-white transition hover:bg-[#243f32] disabled:opacity-50"
            >
              {busy ? pendingAction : "Confirm account"}
            </button>
            <button
              type="button"
              onClick={() => {
                setVerificationEmail("");
                setVerificationCode("");
                setMessage("");
              }}
              className="mt-4 w-full rounded-xl px-4 py-2 text-sm text-[#718077] hover:text-[#315443]"
            >
              Use a different email
            </button>
          </form>
        </section>
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
          className="rounded-[2rem] border border-[#e5e8e2] bg-white p-6 shadow-sm sm:p-8"
        >
          <p className="text-sm text-[#718077]">
            {isRecovery
              ? "Secure your account"
              : isSignup
                ? "Create your account"
                : "Welcome back"}
          </p>
          <h2 className="mt-2 text-3xl font-medium tracking-[-.05em]">
            {isRecovery
              ? "Choose a new password."
              : isSignup
                ? "Begin with your name."
                : "Return to your Scapes."}
          </h2>
          {resetComplete && (
            <p role="status" className="mt-4 text-sm text-[#315443]">
              Password updated. Sign in with your new password.
            </p>
          )}
          {!isRecovery && isSignup && (
            <label className="mt-7 block text-sm font-medium">
              Username
              <input
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="your-name"
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none"
              />
            </label>
          )}
          {!isRecovery && (
            <label className="mt-5 block text-sm font-medium">
              {isSignup ? "Email" : "Username or email"}
              <input
                required
                value={isSignup ? email : username}
                onChange={(event) =>
                  isSignup
                    ? setEmail(event.target.value)
                    : setUsername(event.target.value)
                }
                type={isSignup ? "email" : "text"}
                autoComplete={isSignup ? "email" : "username"}
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none"
              />
            </label>
          )}
          <div className="mt-5">
            <label className="block text-sm font-medium">
              <span>{isRecovery ? "New password" : "Password"}</span>
              <span className="relative mt-2 block">
                <input
                  required
                  minLength={isSignup || isRecovery ? 10 : 6}
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
                <input
                  required
                  minLength={10}
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none"
                />
                <span className="mt-2 block text-xs font-normal text-[#718077]">Use 10 or more characters, including a letter and a number.</span>
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
          </div>
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
            className="mt-6 w-full rounded-xl bg-[#315443] py-3 text-sm font-medium text-white transition hover:bg-[#243f32] disabled:opacity-50"
          >
            {busy
              ? pendingAction
              : isRecovery
                ? "Update password"
                : isSignup
                  ? "Create account"
                  : "Sign in"}
          </button>
          {!isRecovery && (
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
                Continue with Google
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
              className="font-medium text-[#315443]"
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
