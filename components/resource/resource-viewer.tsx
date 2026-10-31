"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { useAuth } from "@/components/auth/auth-provider";
import { Resource } from "@/lib/mock-data";
import { loadRemoteScape, newId, saveScape, useScape } from "@/lib/scape-store";
import { DeferredPageLoader } from "@/components/ui/deferred-page-loader";

const log = (action: string, detail: string) => ({ id: newId("activity"), action, detail, time: new Date().toISOString() });
function extension(title: string) { const part = title.split(".").pop(); return part && part !== title ? part.toUpperCase() : "FILE"; }
async function downloadResource(url: string, name: string) {
  const link = document.createElement("a");
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Download failed");
    const blobUrl = URL.createObjectURL(await response.blob());
    link.href = blobUrl; link.download = name; link.click();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1_000);
  } catch {
    link.href = url; link.target = "_blank"; link.rel = "noreferrer"; link.click();
  }
}

export default function ResourceViewer() {
  const params = useParams<{ id: string; resourceId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const scape = useScape(params.id);
  const [editing, setEditing] = useState(() => searchParams.get("edit") === "1");
  const { user } = useAuth();
  const resource = scape?.resources.find((item) => item.id === params.resourceId);
  const [loading, setLoading] = useState(!scape || Boolean(scape.summary) || !resource);

  useEffect(() => {
    if (!params.id) return;
    let active = true;
    void loadRemoteScape(params.id).then(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [params.id, params.resourceId]);

  if (loading && (!scape || !resource)) return <DeferredPageLoader title="Opening your resource…" description="Preparing the item in your Scape." />;

  if (!scape || !resource) {
    return (
      <main className="grid min-h-screen place-items-center text-sm text-[#718077]">
        <div className="text-center">
          <p>Resource not found</p>
          <button onClick={() => router.push("/workspace/" + params.id)} className="mt-3 rounded-lg bg-[#315443] px-4 py-2 text-white">Return to workspace</button>
        </div>
      </main>
    );
  }

  const currentScape = scape;
  const currentResource = resource;
  const canEdit = currentScape.ownerId === user?.id || currentScape.collaborators?.some((person) => (person.id === user?.id || person.email === user?.email) && person.permission === "edit") === true;
  const downloadUrl = currentResource.downloadUrl || currentResource.content;
  const downloadable = currentResource.type !== "note" && currentResource.type !== "task" && currentResource.type !== "link" && Boolean(downloadUrl?.startsWith("data:") || downloadUrl?.startsWith("https://"));
  function save(title: string, content: string) { if (!canEdit) return; void saveScape({ ...currentScape, resources: currentScape.resources.map((item) => item.id === currentResource.id ? { ...item, title, content } : item), activity: [log("Resource updated", title), ...currentScape.activity] }); setEditing(false); }
  function remove() { if (!canEdit || !window.confirm("Delete this resource?")) return; void saveScape({ ...currentScape, resources: currentScape.resources.filter((item) => item.id !== currentResource.id), activity: [log("Resource deleted", currentResource.title), ...currentScape.activity] }); router.push("/workspace/" + currentScape.id); }
  function toggleStar() { if (!canEdit) return; void saveScape({ ...currentScape, resources: currentScape.resources.map((item) => item.id === currentResource.id ? { ...item, starred: !item.starred } : item), activity: [log(currentResource.starred ? "Resource unstarred" : "Resource starred", currentResource.title), ...currentScape.activity] }); }
  return <main className="min-h-screen bg-[#f7f7f3]"><header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6 sm:px-8"><Link href={"/workspace/" + currentScape.id} className="inline-flex items-center gap-2 text-sm text-[#718077] hover:text-[#17231d]"><Icon name="back" className="h-4 w-4" />Back to Scape</Link><div className="flex gap-2">{downloadable && <button onClick={() => void downloadResource(downloadUrl!, currentResource.title)} className="grid h-10 w-10 place-items-center rounded-full border border-[#dce1d9] bg-white text-[#315443] hover:bg-[#edf0df]" aria-label={"Download " + currentResource.title}><Icon name="download" className="h-4 w-4" /></button>}{canEdit && <><button onClick={toggleStar} className={"star-control grid h-10 w-10 place-items-center rounded-full border border-[#dce1d9] bg-white hover:bg-[#edf0df] " + (currentResource.starred ? "text-[#c99a17]" : "text-[#718077]")} aria-label={currentResource.starred ? "Remove from starred" : "Add to starred"}><Icon name="star" className={"h-4 w-4 " + (currentResource.starred ? "fill-current text-[#c99a17]" : "")} strokeWidth={2.2} /></button><button onClick={remove} className="rounded-full border border-[#dce1d9] bg-white p-2 text-[#a95b54] hover:bg-[#f7e8e5]" aria-label={"Delete " + currentResource.title}><Icon name="delete" className="h-4 w-4" /></button><button onClick={() => setEditing(!editing)} className="rounded-full border border-[#dce1d9] bg-white px-4 py-2 text-sm">{editing ? "Cancel" : "Edit"}</button></>}</div></header><section className="mx-auto max-w-4xl px-5 pb-20 pt-8 sm:px-8">{editing && canEdit ? <Editor resource={currentResource} save={save} remove={remove} /> : <Viewer resource={currentResource} />}</section></main>;
}

function Editor({ resource, save, remove }: { resource: Resource; save: (title: string, content: string) => void; remove: () => void }) {
  const [title, setTitle] = useState(resource.title); const [content, setContent] = useState(resource.content || "");
  return <div className="rounded-[2rem] border border-[#e5e8e2] bg-white p-6 shadow-sm sm:p-10"><p className="text-sm capitalize text-[#718077]">Editing {resource.type}</p><input value={title} onChange={(item) => setTitle(item.target.value)} className="mt-5 w-full border-0 text-3xl font-medium tracking-[-.05em] outline-none" /><textarea value={content} onChange={(item) => setContent(item.target.value)} placeholder="Add some detail..." className="mt-8 min-h-64 w-full resize-none border-0 text-base leading-7 outline-none placeholder:text-[#a4ada6]" /><div className="mt-5 flex items-center justify-between gap-3"><button onClick={() => save(title, content)} className="rounded-full bg-[#315443] px-5 py-3 text-sm font-medium text-white">Save changes</button><button onClick={remove} className="rounded-full px-4 py-2 text-sm text-[#a95b54] hover:bg-[#f7e8e5]">Delete</button></div></div>;
}

function Viewer({ resource }: { resource: Resource }) {
  const uploaded = Boolean(resource.content?.startsWith("data:") || resource.content?.startsWith("https://"));
  const pdf = resource.mimeType === "application/pdf" || resource.title.toLowerCase().endsWith(".pdf");
  const genericFile = resource.type === "file" || resource.type === "image" || resource.type === "video" || resource.type === "audio";
  const downloadUrl = resource.downloadUrl || resource.content;
  return <><p className="text-sm capitalize text-[#718077]">{resource.type} · {resource.date}</p><h1 className="mt-4 break-words text-4xl font-medium tracking-[-.06em] sm:text-6xl">{resource.title}</h1>
    {resource.type === "note" && <article className="mt-8 max-w-2xl whitespace-pre-wrap text-lg leading-8">{resource.content || "No content yet."}</article>}
    {resource.type === "link" && <a href={resource.content || "#"} target="_blank" rel="noreferrer" className="mt-8 block max-w-xl rounded-2xl border border-[#dfe5dd] bg-white p-5 shadow-sm"><Icon name="link" className="h-6 w-6 text-[#315443]" /><p className="mt-4 font-medium">Open reference</p><p className="mt-1 break-all text-sm text-[#718077]">{resource.content || "No URL provided"}</p></a>}
    {resource.type === "task" && <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm"><Icon name="task" className="h-6 w-6 text-[#315443]" /><p className="mt-4 text-lg">{resource.done ? "Complete" : "Not started"}</p></div>}
    {resource.type === "image" && uploaded && <Image src={resource.content!} alt={resource.title} width={1200} height={800} unoptimized className="mt-8 max-h-[32rem] w-full rounded-2xl border border-[#e0e5df] object-contain" />}
    {resource.type === "video" && uploaded && <video controls src={resource.content} className="mt-8 w-full rounded-2xl border border-[#e0e5df]" />}
    {resource.type === "audio" && uploaded && <audio controls src={resource.content} className="mt-8 w-full" />}
    {resource.type === "file" && uploaded && pdf && <div className="mt-8 overflow-hidden rounded-2xl border border-[#e0e5df] bg-white"><div className="flex items-center justify-between border-b border-[#e0e5df] px-4 py-3"><p className="text-sm font-medium">PDF preview</p><div className="flex gap-3 text-sm"><a href={resource.content} target="_blank" rel="noreferrer" className="text-[#315443] hover:underline">Open</a><button onClick={() => void downloadResource(downloadUrl!, resource.title)} className="text-[#315443] hover:underline">Download</button></div></div><iframe src={resource.content} title={resource.title} className="h-[38rem] w-full bg-white" /></div>}
    {genericFile && (!uploaded || (resource.type === "file" && !pdf)) && <FileCard resource={resource} />}
  </>;
}

function FileCard({ resource }: { resource: Resource }) {
  const downloadUrl = resource.downloadUrl || resource.content;
  const downloadable = Boolean(downloadUrl?.startsWith("data:") || downloadUrl?.startsWith("https://"));
  const presentation = /\.(ppt|pptx)$/i.test(resource.title) || /presentationml|powerpoint/i.test(resource.mimeType || "");
  const wordDocument = /\.(doc|docx)$/i.test(resource.title) || /wordprocessingml|msword/i.test(resource.mimeType || "");
  const officeFile = presentation || wordDocument;
  const previewUrl = officeFile && resource.content?.startsWith("https://") ? "https://view.officeapps.live.com/op/embed.aspx?src=" + encodeURIComponent(resource.content) : undefined;
  const previewLabel = presentation ? "Presentation" : "Word document";
  return <div className="mt-8 max-w-4xl rounded-2xl border border-[#dfe5dd] bg-white p-6 shadow-sm"><div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-xl bg-[#edf0df] text-sm font-semibold text-[#315443]">{extension(resource.title)}</span><div className="min-w-0"><p className="truncate font-medium">{resource.title}</p><p className="mt-1 text-sm text-[#718077]">{resource.mimeType || "File"}</p></div></div>{downloadable ? <><div className="mt-5 flex flex-wrap gap-3"><button onClick={() => void downloadResource(downloadUrl!, resource.title)} className="inline-flex rounded-lg bg-[#315443] px-4 py-3 text-sm font-medium text-white">Download file</button><a href={resource.content} target="_blank" rel="noreferrer" className="inline-flex rounded-lg border px-4 py-3 text-sm">Open file ↗</a>{previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-lg border px-4 py-3 text-sm">Open {previewLabel} ↗</a>}</div>{previewUrl && <div className="mt-6 overflow-hidden rounded-xl border border-[#e0e5df] bg-[#f7f7f3]"><iframe src={previewUrl} title={resource.title} className="h-[38rem] w-full" allowFullScreen /><p className="border-t border-[#e0e5df] px-4 py-3 text-xs text-[#718077]">{previewLabel} preview</p></div>}</> : <p className="mt-5 text-sm text-[#718077]">No file data is attached yet.</p>}</div>;
}
