"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useState } from "react";
import { AppHeader } from "@/components/ui/app-header";

export default function CreateScape() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [thumbnailMode, setThumbnailMode] = useState<"color" | "image">("color");

  function chooseImage(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setThumbnail(String(reader.result)); setThumbnailMode("image"); };
    reader.readAsDataURL(file);
  }
  function chooseColor(color: string) { setThumbnail(color); setThumbnailMode("color"); }
  function go() {
    if (thumbnail) sessionStorage.setItem("deepscapes-draft-thumbnail", thumbnail);
    else sessionStorage.removeItem("deepscapes-draft-thumbnail");
    const params = new URLSearchParams({ title: title || "Untitled Scape", description });
    router.push("/templates?" + params.toString());
  }
  const preview = thumbnail ? { "--scape-cover": thumbnailMode === "image" ? "url(" + thumbnail + ")" : thumbnail } as CSSProperties : undefined;

  return <main className="min-h-screen"><AppHeader compact /><section className="mx-auto max-w-2xl px-5 py-14 sm:py-24"><Link href="/scapes" className="text-sm text-[#718077] hover:text-[#17231d]">← Back to your Scapes</Link><div className="mt-12"><p className="text-sm font-medium uppercase tracking-[.18em] text-[#718077]">A space of your own</p><h1 className="mt-4 text-4xl font-medium tracking-[-.055em] sm:text-5xl">What are you<br /><em className="font-serif font-normal">making space for?</em></h1><p className="mt-5 max-w-md leading-7 text-[#718077]">Start with a name. You can make it yours as you go.</p></div><div className="mt-12 space-y-7"><label className="block"><span className="mb-2 block text-sm font-medium">Scape name</span><input autoFocus value={title} onChange={(item) => setTitle(item.target.value)} onKeyDown={(item) => item.key === "Enter" && go()} placeholder="e.g. A quieter way to travel" className="w-full rounded-2xl border border-[#e0e4dd] bg-white px-5 py-4 outline-none transition placeholder:text-[#a6aea8] focus:border-[#315443] focus:ring-4 focus:ring-[#315443]/10" /></label><label className="block"><span className="mb-2 block text-sm font-medium">A short description <span className="font-normal text-[#8c978f]">(optional)</span></span><textarea value={description} onChange={(item) => setDescription(item.target.value)} placeholder="What is this project about?" className="h-28 w-full resize-none rounded-2xl border border-[#e0e4dd] bg-white px-5 py-4 outline-none transition placeholder:text-[#a6aea8] focus:border-[#315443] focus:ring-4 focus:ring-[#315443]/10" /></label><div><span className="mb-2 block text-sm font-medium">Scape thumbnail <span className="font-normal text-[#8c978f]">(optional)</span></span><div className="flex flex-wrap items-center gap-4 rounded-2xl border border-dashed border-[#aab4aa] bg-white p-3"><div className={"scape-thumbnail-preview h-16 w-24 overflow-hidden rounded-xl bg-[#edf0df] " + (!thumbnail ? "" : "")} style={preview} /><div className="flex flex-wrap items-center gap-3"><input type="color" value={thumbnailMode === "color" && thumbnail ? thumbnail : "#315443"} onChange={(item) => chooseColor(item.target.value)} className="h-10 w-12 cursor-pointer rounded border p-1" aria-label="Choose thumbnail color" /><label className="cursor-pointer rounded-lg border px-3 py-2 text-sm">Upload image<input type="file" accept="image/*" onChange={(item) => chooseImage(item.target.files?.[0])} className="hidden" /></label></div></div></div><button onClick={go} className="w-full rounded-2xl bg-[#315443] px-5 py-4 font-medium text-white transition hover:bg-[#254235]">Continue to templates →</button></div></section></main>;
}
