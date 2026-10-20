"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import { Resource } from "@/lib/mock-data";
import { newId, saveScape, useScape } from "@/lib/scape-store";

const log = (action: string, detail: string) => ({ id: newId("activity"), action, detail, time: new Date().toISOString() });
function extension(title: string) { const part = title.split(".").pop(); return part && part !== title ? part.toUpperCase() : "FILE"; }

export default function ResourceViewer() {
  const params = useParams<{ id: string; resourceId: string }>(); const router = useRouter(); const searchParams = useSearchParams(); const scape = useScape(params.id); const [editing, setEditing] = useState(() => searchParams.get("edit") === "1");
  const resource = scape?.resources.find((item) => item.id === params.resourceId);
  if (!scape || !resource) return <main className="grid min-h-screen place-items-center text-sm text-[#718077]"><button onClick={() => router.push("/workspace/" + params.id)}>Return to workspace</button></main>;
  function save(title: string, content: string) { void saveScape({ ...scape!, resources: scape!.resources.map((item) => item.id === resource!.id ? { ...item, title, content } : item), activity: [log("Resource updated", title), ...scape!.activity] }); setEditing(false); }
  function remove() { if (!window.confirm("Delete this resource?")) return; void saveScape({ ...scape!, resources: scape!.resources.filter((item) => item.id !== resource!.id), activity: [log("Resource deleted", resource!.title), ...scape!.activity] }); router.push("/workspace/" + scape!.id); }
  function toggleStar() { void saveScape({ ...scape!, resources: scape!.resources.map((item) => item.id === resource!.id ? { ...item, starred: !item.starred } : item), activity: [log(resource!.starred ? "Resource unstarred" : "Resource starred", resource!.title), ...scape!.activity] }); }
  return <main className="min-h-screen bg-[#f7f7f3]"><header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6 sm:px-8"><Link href={"/workspace/" + scape.id} className="inline-flex items-center gap-2 text-sm text-[#718077] hover:text-[#17231d]"><Icon name="back" className="h-4 w-4" />Back to Scape</Link><div className="flex gap-2"><button onClick={toggleStar} className={"rounded-full border bg-white p-2 " + (resource.starred ? "border-[#b99b46] text-[#b99b46]" : "border-[#dce1d9]")} aria-label={resource.starred ? "Remove from starred" : "Add to starred"}>★</button><button onClick={remove} className="rounded-full border border-[#dce1d9] bg-white p-2 text-[#a95b54] hover:bg-[#f7e8e5]" aria-label={"Delete " + resource.title}><Icon name="delete" className="h-4 w-4" /></button><button onClick={() => setEditing(!editing)} className="rounded-full border border-[#dce1d9] bg-white px-4 py-2 text-sm">{editing ? "Cancel" : "Edit"}</button></div></header><section className="mx-auto max-w-4xl px-5 pb-20 pt-8 sm:px-8">{editing ? <Editor resource={resource} save={save} remove={remove} /> : <Viewer resource={resource} />}</section></main>;
}

function Editor({ resource, save, remove }: { resource: Resource; save: (title: string, content: string) => void; remove: () => void }) {
  const [title, setTitle] = useState(resource.title); const [content, setContent] = useState(resource.content || "");
  return <div className="rounded-[2rem] border border-[#e5e8e2] bg-white p-6 shadow-sm sm:p-10"><p className="text-sm capitalize text-[#718077]">Editing {resource.type}</p><input value={title} onChange={(item) => setTitle(item.target.value)} className="mt-5 w-full border-0 text-3xl font-medium tracking-[-.05em] outline-none" /><textarea value={content} onChange={(item) => setContent(item.target.value)} placeholder="Add some detail..." className="mt-8 min-h-64 w-full resize-none border-0 text-base leading-7 outline-none placeholder:text-[#a4ada6]" /><div className="mt-5 flex items-center justify-between gap-3"><button onClick={() => save(title, content)} className="rounded-full bg-[#315443] px-5 py-3 text-sm font-medium text-white">Save changes</button><button onClick={remove} className="rounded-full px-4 py-2 text-sm text-[#a95b54] hover:bg-[#f7e8e5]">Delete</button></div></div>;
}

function Viewer({ resource }: { resource: Resource }) {
  const uploaded = Boolean(resource.content?.startsWith("data:") || resource.content?.startsWith("https://"));
  const pdf = resource.mimeType === "application/pdf" || resource.title.toLowerCase().endsWith(".pdf");
  const genericFile = resource.type === "file" || resource.type === "image" || resource.type === "video" || resource.type === "audio";
  return <><p className="text-sm capitalize text-[#718077]">{resource.type} · {resource.date}</p><h1 className="mt-4 break-words text-4xl font-medium tracking-[-.06em] sm:text-6xl">{resource.title}</h1>
    {resource.type === "note" && <article className="mt-8 max-w-2xl whitespace-pre-wrap text-lg leading-8">{resource.content || "No content yet."}</article>}
    {resource.type === "link" && <a href={resource.content || "#"} target="_blank" rel="noreferrer" className="mt-8 block max-w-xl rounded-2xl border border-[#dfe5dd] bg-white p-5 shadow-sm"><Icon name="link" className="h-6 w-6 text-[#315443]" /><p className="mt-4 font-medium">Open reference</p><p className="mt-1 break-all text-sm text-[#718077]">{resource.content || "No URL provided"}</p></a>}
    {resource.type === "task" && <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm"><Icon name="task" className="h-6 w-6 text-[#315443]" /><p className="mt-4 text-lg">{resource.done ? "Complete" : "Not started"}</p></div>}
    {resource.type === "image" && uploaded && <Image src={resource.content!} alt={resource.title} width={1200} height={800} unoptimized className="mt-8 max-h-[32rem] w-full rounded-2xl border border-[#e0e5df] object-contain" />}
    {resource.type === "video" && uploaded && <video controls src={resource.content} className="mt-8 w-full rounded-2xl border border-[#e0e5df]" />}
    {resource.type === "audio" && uploaded && <audio controls src={resource.content} className="mt-8 w-full" />}
    {resource.type === "file" && uploaded && pdf && <object aria-label={resource.title} data={resource.content} type="application/pdf" className="mt-8 h-[38rem] w-full rounded-2xl border border-[#e0e5df] bg-white"><a href={resource.content} download={resource.title} className="p-4 underline">Download PDF</a></object>}
    {genericFile && (!uploaded || (resource.type === "file" && !pdf)) && <FileCard resource={resource} />}
  </>;
}

function FileCard({ resource }: { resource: Resource }) {
  const downloadable = Boolean(resource.content?.startsWith("data:") || resource.content?.startsWith("https://"));
  const presentation = /\.(ppt|pptx)$/i.test(resource.title) || /presentationml|powerpoint/i.test(resource.mimeType || "");
  const previewUrl = presentation && resource.content ? "https://view.officeapps.live.com/op/embed.aspx?src=" + encodeURIComponent(resource.content) : undefined;
  return <div className="mt-8 max-w-4xl rounded-2xl border border-[#dfe5dd] bg-white p-6 shadow-sm"><div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-xl bg-[#edf0df] text-sm font-semibold text-[#315443]">{extension(resource.title)}</span><div className="min-w-0"><p className="truncate font-medium">{resource.title}</p><p className="mt-1 text-sm text-[#718077]">{resource.mimeType || "File"}</p></div></div>{downloadable ? <><div className="mt-5 flex flex-wrap gap-3"><a href={resource.content} download={resource.title} className="inline-flex rounded-lg bg-[#315443] px-4 py-3 text-sm font-medium text-white">Download file</a>{previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-lg border px-4 py-3 text-sm">Open presentation ↗</a>}</div>{previewUrl && <div className="mt-6 overflow-hidden rounded-xl border border-[#e0e5df] bg-[#f7f7f3]"><iframe src={previewUrl} title={resource.title} className="h-[38rem] w-full" allowFullScreen /><p className="border-t border-[#e0e5df] px-4 py-3 text-xs text-[#718077]">Presentation preview</p></div>}</> : <p className="mt-5 text-sm text-[#718077]">No file data is attached yet.</p>}</div>;
}
