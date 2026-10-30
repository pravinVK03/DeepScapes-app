"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/ui/app-header";
import { Scape, Template, templates as builtInTemplates } from "@/lib/mock-data";
import { addScape, newId } from "@/lib/scape-store";
import { useAuth } from "@/components/auth/auth-provider";
import { takeDraftThumbnail } from "@/lib/scape-draft";

export default function TemplateGallery() {
  const params = useSearchParams();
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>(builtInTemplates);
  const [creating, setCreating] = useState(false);
  const { user } = useAuth();
  const title = params.get("title") || "Untitled Scape";
  const description = params.get("description") || "";
  const blankTemplate = templates.find((template) => template.name === "Blank Scape");
  const structuredTemplates = templates.filter((template) => template.name !== "Blank Scape");

  useEffect(() => {
    void fetch("/api/templates")
      .then((response) => response.ok ? response.json() : undefined)
      .then((data: { templates?: Template[] } | undefined) => { if (data?.templates?.length) setTemplates(data.templates); })
      .catch(() => undefined);
  }, []);

  function createScape(template: Template) {
    if (creating) return;
    setCreating(true);
    const id = newId(title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "scape");
    const thumbnail = takeDraftThumbnail();
    const now = new Date().toISOString();
    const resources = template.sections.map((section, index) => ({
      id: `starter-${index}`,
      title: section,
      type: index === 2 ? "task" as const : "note" as const,
      detail: index === 2 ? "Task · Not started" : "Note",
      date: now,
    }));
    const scape: Scape = {
      id, title, description, template: template.name, cover: thumbnail || template.color,
      updated: "Just created", createdAt: now, updatedAt: now, resources,
      activity: [{ id: "created", action: "Scape created", detail: template.name, time: now }],
      ownerId: user?.id,
      collaborators: user?.email ? [{ id: user.id, name: typeof user.user_metadata.username === "string" ? user.user_metadata.username : user.email.split("@")[0], email: user.email, permission: "edit" }] : [],
    };
    void addScape(scape).catch(() => undefined);
    router.push(`/workspace/${id}`);
  }

  return <main className="min-h-screen"><AppHeader compact /><section className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10"><Link href="/create" className="text-sm text-[#718077] hover:text-[#17231d]">← Back</Link><div className="mt-8 max-w-2xl"><p className="text-sm font-medium uppercase tracking-[.18em] text-[#718077]">Choose a template</p><h1 className="mt-3 text-4xl font-medium tracking-[-.055em] sm:text-5xl">Start with a<br /><em className="font-serif font-normal">clear structure.</em></h1></div>{blankTemplate && <section className="mt-9 border-b border-[#e5e8e2] pb-8"><h2 className="text-xl font-semibold tracking-[-.04em]">Blank Scape</h2><button type="button" disabled={creating} onClick={() => createScape(blankTemplate)} className="group mt-4 w-full max-w-md rounded-2xl border border-[#e5e8e2] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-wait disabled:opacity-60"><span className="template-swatch grid h-10 w-10 place-items-center rounded-xl text-lg" style={{ background: blankTemplate.color }}>{blankTemplate.icon}</span><h3 className="mt-6 font-semibold tracking-[-.03em]">{blankTemplate.name}</h3><p className="mt-2 text-sm leading-5 text-[#718077]">{blankTemplate.description}</p><span className="mt-5 inline-block text-sm font-medium text-[#315443]">{creating ? "Creating Scape…" : "Create blank Scape →"}</span></button></section>}<section className="mt-8"><h2 className="text-xl font-semibold tracking-[-.04em]">Templates</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{structuredTemplates.map((template) => <button type="button" disabled={creating} onClick={() => createScape(template)} key={template.name} className="group rounded-2xl border border-[#e5e8e2] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-wait disabled:opacity-60"><span className="template-swatch grid h-10 w-10 place-items-center rounded-xl text-lg" style={{ background: template.color }}>{template.icon}</span><h3 className="mt-6 font-semibold tracking-[-.03em]">{template.name}</h3><p className="mt-2 min-h-10 text-sm leading-5 text-[#718077]">{template.description}</p><span className="mt-5 inline-block text-sm font-medium text-[#315443]">{creating ? "Creating Scape…" : "Use template →"}</span></button>)}</div></section></section></main>;
}
