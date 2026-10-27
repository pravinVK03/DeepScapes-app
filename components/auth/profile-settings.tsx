"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { AppHeader } from "@/components/ui/app-header";
import { useAuth } from "@/components/auth/auth-provider";
import { getBrowserSupabase } from "@/lib/supabase-browser";

type Preference = "system" | "light" | "dark";

async function prepareImage(file?: File, zoom = 1, horizontal = 0, vertical = 0) {
  if (!file || !file.type.startsWith("image/") || file.size > 2_000_000) return null;
  const image = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const size = 160;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image preparation is unavailable.");
  const scale = Math.max(size / image.width, size / image.height) * zoom;
  const width = image.width * scale; const height = image.height * scale;
  const x = (size - width) / 2 + ((width - size) / 2) * (horizontal / 100);
  const y = (size - height) / 2 + ((height - size) / 2) * (vertical / 100);
  context.drawImage(image, x, y, width, height);
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
  const [sourceImage, setSourceImage] = useState<File>();
  const [zoom, setZoom] = useState(1);
  const [horizontal, setHorizontal] = useState(0);
  const [vertical, setVertical] = useState(0);

  useEffect(() => {
    if (!sourceImage) return;
    let cancelled = false;
    void prepareImage(sourceImage, zoom, horizontal, vertical).then((image) => { if (image && !cancelled) setAvatar(image); }).catch(() => { if (!cancelled) setStatus("We could not prepare that profile image. Please try another image."); });
    return () => { cancelled = true; };
  }, [horizontal, sourceImage, vertical, zoom]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    setStatus("");
    try {
      const file = event.target.files?.[0];
      if (!file || !file.type.startsWith("image/") || file.size > 2_000_000) { setStatus("Choose an image under 2 MB."); return; }
      setZoom(1); setHorizontal(0); setVertical(0); setSourceImage(file);
      setStatus("Image ready. Adjust the preview, then save changes.");
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
  return <main className="min-h-screen"><AppHeader /><section className="mx-auto max-w-xl px-5 py-12 sm:px-8"><p className="text-sm font-medium uppercase tracking-[.18em] text-[#718077]">Profile</p><h1 className="mt-3 text-4xl font-medium tracking-[-.05em]">Make it yours.</h1><form onSubmit={save} className="mt-8 rounded-[2rem] border border-[#e5e8e2] bg-white p-6 shadow-sm sm:p-8"><p className="text-sm text-[#718077]">@{username}</p><label className="mt-5 block text-sm font-medium">Your name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-2 w-full rounded-xl border px-4 py-3 outline-none" /></label><div className="mt-5"><p className="text-sm font-medium">Profile image</p><label className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#dce1d9] px-3 py-3 text-sm text-[#718077] hover:border-[#315443] hover:text-[#315443]"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#edf0df] bg-cover bg-center text-base" style={imageAvatar ? { backgroundImage: `url(${avatar})` } : undefined}>{imageAvatar ? "" : avatar}</span>Upload a profile image<input type="file" accept="image/*" onChange={(event) => void upload(event)} className="hidden" /></label>{sourceImage && <div className="mt-3 rounded-xl border border-[#e5e8e2] bg-[#f7f7f3] p-4"><div className="flex items-center gap-4"><span className="h-20 w-20 shrink-0 rounded-full border border-[#dce1d9] bg-cover bg-center" style={{ backgroundImage: `url(${avatar})` }} aria-label="Profile image preview" /><p className="text-sm text-[#718077]">Preview your profile image before saving.</p></div><div className="mt-4 grid gap-3 text-xs text-[#718077]"><label className="grid grid-cols-[5rem_1fr] items-center gap-3">Zoom<input type="range" min="1" max="2" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label><label className="grid grid-cols-[5rem_1fr] items-center gap-3">Horizontal<input type="range" min="-100" max="100" value={horizontal} onChange={(event) => setHorizontal(Number(event.target.value))} /></label><label className="grid grid-cols-[5rem_1fr] items-center gap-3">Vertical<input type="range" min="-100" max="100" value={vertical} onChange={(event) => setVertical(Number(event.target.value))} /></label></div></div>}</div><label className="mt-5 block text-sm font-medium">Appearance preference<select value={preference} onChange={(event) => setPreference(event.target.value as Preference)} className="mt-2 w-full rounded-xl border bg-white px-4 py-3 outline-none"><option value="system">Follow my device</option><option value="light">Light</option><option value="dark">Dark</option></select></label>{status && <p role="status" className="mt-4 text-sm text-[#718077]">{status}</p>}<button disabled={saving} className="auth-primary-action mt-6 w-full rounded-xl bg-[#315443] py-3 text-sm font-medium text-white disabled:opacity-50">{saving ? "Saving your profile…" : "Save changes"}</button></form></section></main>;
}
