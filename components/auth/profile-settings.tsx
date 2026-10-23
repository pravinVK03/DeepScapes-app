"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { AppHeader } from "@/components/ui/app-header";
import { useAuth } from "@/components/auth/auth-provider";
import { getBrowserSupabase } from "@/lib/supabase-browser";

type Preference = "system" | "light" | "dark";

async function prepareImage(file?: File) {
  if (!file || !file.type.startsWith("image/") || file.size > 2_000_000) return null;
  const image = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const size = 160;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image preparation is unavailable.");
  const scale = Math.max(size / image.width, size / image.height);
  context.drawImage(image, (size - image.width * scale) / 2, (size - image.height * scale) / 2, image.width * scale, image.height * scale);
  image.close();
  return canvas.toDataURL("image/jpeg", 0.78);
}

export function ProfileSettings() {
  const { user } = useAuth();
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const username = typeof metadata.username === "string" ? metadata.username : "";
  const [displayName, setDisplayName] = useState(typeof metadata.display_name === "string" ? metadata.display_name : "");
  const [avatar, setAvatar] = useState(typeof metadata.avatar === "string" ? metadata.avatar : "🌿");
  const [preference, setPreference] = useState<Preference>(metadata.appearance_preference === "light" || metadata.appearance_preference === "dark" ? metadata.appearance_preference : "system");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    setStatus("");
    try {
      const image = await prepareImage(event.target.files?.[0]);
      if (!image) { setStatus("Choose an image under 2 MB."); return; }
      setAvatar(image);
      setStatus("Image uploaded. Save changes when you’re ready.");
    } catch { setStatus("We could not prepare that profile image. Please try another image."); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) { setStatus("Profile settings are unavailable until Supabase is configured."); return; }
    setSaving(true); setStatus("");
    const { error } = await supabase.auth.updateUser({ data: { display_name: displayName.trim() || username, avatar, appearance_preference: preference, profile_completed: true } });
    setSaving(false);
    setStatus(error ? error.message : "Profile saved.");
  }

  const imageAvatar = avatar.startsWith("data:image/");
  return <main className="min-h-screen"><AppHeader /><section className="mx-auto max-w-xl px-5 py-12 sm:px-8"><p className="text-sm font-medium uppercase tracking-[.18em] text-[#718077]">Profile</p><h1 className="mt-3 text-4xl font-medium tracking-[-.05em]">Make it yours.</h1><form onSubmit={save} className="mt-8 rounded-[2rem] border border-[#e5e8e2] bg-white p-6 shadow-sm sm:p-8"><p className="text-sm text-[#718077]">@{username}</p><label className="mt-5 block text-sm font-medium">Your name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-2 w-full rounded-xl border px-4 py-3 outline-none" /></label><div className="mt-5"><p className="text-sm font-medium">Profile image</p><label className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#dce1d9] px-3 py-3 text-sm text-[#718077] hover:border-[#315443] hover:text-[#315443]"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#edf0df] bg-cover bg-center text-base" style={imageAvatar ? { backgroundImage: `url(${avatar})` } : undefined}>{imageAvatar ? "" : avatar}</span>Upload a profile image<input type="file" accept="image/*" onChange={(event) => void upload(event)} className="hidden" /></label></div><label className="mt-5 block text-sm font-medium">Appearance preference<select value={preference} onChange={(event) => setPreference(event.target.value as Preference)} className="mt-2 w-full rounded-xl border bg-white px-4 py-3 outline-none"><option value="system">Follow my device</option><option value="light">Light</option><option value="dark">Dark</option></select></label>{status && <p role="status" className="mt-4 text-sm text-[#718077]">{status}</p>}<button disabled={saving} className="auth-primary-action mt-6 w-full rounded-xl bg-[#315443] py-3 text-sm font-medium text-white disabled:opacity-50">{saving ? "Saving your profile…" : "Save changes"}</button></form></section></main>;
}
