"use client";
/* eslint-disable @next/next/no-img-element -- profile previews include locally cropped data URLs. */

import { type ChangeEvent, type FormEvent, useState } from "react";
import { AppHeader } from "@/components/ui/app-header";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { Icon } from "@/components/ui/icons";
import { useNotifications } from "@/components/ui/notification-center";

type Preference = "system" | "light" | "dark";

function ProfilePreview({ avatar, className, alt }: { avatar: string; className: string; alt: string }) {
  const hasImage = /^(data:image\/|https?:\/\/)/i.test(avatar);
  return <span className={`profile-settings-avatar grid shrink-0 place-items-center overflow-hidden bg-[#edf0df] text-xl ${className}`}>
    {hasImage ? <img src={avatar} alt={alt} className="h-full w-full object-cover" /> : avatar && avatar !== "🌿" ? avatar : <Icon name="user" className="profile-settings-avatar-icon h-6 w-6" strokeWidth={2.25} />}
  </span>;
}

export function ProfileSettings() {
  const { user } = useAuth();
  const { notify } = useNotifications();
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const username = typeof metadata.username === "string" ? metadata.username : "";
  const [displayName, setDisplayName] = useState(typeof metadata.display_name === "string" ? metadata.display_name : "");
  const [avatar, setAvatar] = useState(typeof metadata.avatar === "string" ? metadata.avatar : "");
  const [preference, setPreference] = useState<Preference>(metadata.appearance_preference === "light" || metadata.appearance_preference === "dark" ? metadata.appearance_preference : "system");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [cropFile, setCropFile] = useState<File>();
  const imageAvatar = /^(data:image\/|https?:\/\/)/i.test(avatar);

  function upload(event: ChangeEvent<HTMLInputElement>) {
    setStatus("");
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/") || file.size > 2_000_000) {
      setStatus("Choose an image under 2 MB.");
      return;
    }
    setCropFile(file);
  }

  function choosePreference(next: Preference) {
    setPreference(next);
    if (next === "system") {
      window.localStorage.removeItem("deepscapes-theme");
      document.documentElement.classList.toggle("dark", window.matchMedia("(prefers-color-scheme: dark)").matches);
      return;
    }
    window.localStorage.setItem("deepscapes-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) {
      notify({ tone: "error", title: "Profile settings are unavailable", detail: "Connect Supabase before saving changes." });
      return;
    }
    setSaving(true);
    setStatus("");
    const { error } = await supabase.auth.updateUser({ data: {
      display_name: displayName.trim() || username,
      avatar,
      appearance_preference: preference,
      profile_completed: true,
    } });
    setSaving(false);
    if (error) notify({ tone: "error", title: "Profile was not saved", detail: error.message });
    else notify({ tone: "success", title: "Profile saved", detail: "Your account details and appearance preference are up to date." });
  }

  return <main className="min-h-screen">
    <AppHeader />
    <section className="mx-auto grid max-w-5xl gap-8 px-5 py-12 sm:px-8 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.1fr)] lg:py-16">
      <div className="profile-settings-intro lg:pt-6">
        <p className="text-sm font-medium uppercase tracking-[.18em] text-[#718077]">Profile settings</p>
        <h1 className="mt-4 text-4xl font-medium tracking-[-.06em] sm:text-5xl">Make it<br /><em className="font-serif font-normal">yours.</em></h1>
        <p className="mt-5 max-w-sm leading-7 text-[#718077]">Keep your identity recognisable to collaborators and choose how DeepScapes feels on your device.</p>
        <div className="profile-identity-card mt-8 flex items-center gap-4 rounded-2xl border border-[#e5e8e2] bg-white p-4">
          <ProfilePreview avatar={avatar} alt="Profile preview" className="h-14 w-14 rounded-2xl" />
          <span className="min-w-0"><strong className="block truncate font-semibold">{displayName || username || "Your profile"}</strong><span className="mt-1 block truncate text-sm text-[#718077]">@{username || "your-account"}</span></span>
        </div>
      </div>
      <form onSubmit={save} className="profile-settings-panel rounded-[2rem] border border-[#e5e8e2] bg-white p-5 shadow-sm sm:p-8">
        <div className="flex items-start gap-3 border-b border-[#e5e8e2] pb-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf0df] text-[#315443]"><Icon name="note" className="h-5 w-5" /></span><span><h2 className="font-semibold">Your public profile</h2><p className="mt-1 text-sm text-[#718077]">These details appear when you collaborate in a Scape.</p></span></div>
        <label className="mt-6 block text-sm font-medium">Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={username || "How people should know you"} className="mt-2 w-full rounded-xl border border-[#dce1d9] bg-white px-4 py-3 outline-none transition focus:border-[#315443] focus:ring-4 focus:ring-[#315443]/10" /></label>
        <div className="mt-6"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">Profile image</p><p className="mt-1 text-xs text-[#718077]">A square image works best.</p></div>{imageAvatar && <span className="text-xs text-[#315443]">Preview ready</span>}</div><label className="profile-upload-control mt-3 flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-[#dce1d9] p-3 text-left transition"><ProfilePreview avatar={avatar} alt="Selected profile preview" className="h-12 w-12 rounded-xl text-lg" /><span><strong className="block text-sm">Upload a profile image</strong><small className="mt-1 block text-xs text-[#718077]">Choose, crop, and preview before saving.</small></span><Icon name="arrow" className="ml-auto h-4 w-4 text-[#718077]" /><input type="file" accept="image/*" onChange={upload} className="hidden" /></label>{status && <p role="status" className="mt-2 text-xs text-[#a95b54]">{status}</p>}</div>
        <div className="mt-7 border-t border-[#e5e8e2] pt-6"><div><p className="text-sm font-medium">Appearance</p><p className="mt-1 text-xs text-[#718077]">Choose a preference for this browser.</p></div><div className="mt-4 grid grid-cols-3 gap-2">{(["system", "light", "dark"] as Preference[]).map((option) => <button key={option} type="button" onClick={() => choosePreference(option)} aria-pressed={preference === option} className={`profile-appearance-option rounded-xl border px-2 py-3 text-sm font-medium transition ${preference === option ? "border-[#315443] bg-[#edf0df] text-[#315443]" : "border-[#e5e8e2] bg-white text-[#718077]"}`}><span className="mx-auto mb-2 block h-3 w-7 rounded-full border border-current opacity-70" />{option === "system" ? "System" : option[0].toUpperCase() + option.slice(1)}</button>)}</div></div>
        <button disabled={saving} className="auth-primary-action mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#315443] py-3 text-sm font-medium text-white disabled:opacity-50">{saving ? "Saving your profile…" : <><Icon name="task" className="h-4 w-4" />Save changes</>}</button>
      </form>
    </section>
    {cropFile && <ImageCropDialog file={cropFile} shape="circle" close={() => setCropFile(undefined)} save={(image) => { setAvatar(image); setCropFile(undefined); setStatus("Profile picture updated. Save changes when you’re ready."); }} />}
  </main>;
}
