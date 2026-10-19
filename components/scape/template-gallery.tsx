"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/ui/app-header";
import { Scape, Template, templates as builtInTemplates } from "@/lib/mock-data";
import { addScape, newId } from "@/lib/scape-store";
import { useAuth } from "@/components/auth/auth-provider";

export default function TemplateGallery() {
  const params = useSearchParams();
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>(builtInTemplates);
  const { user } = useAuth();
  const title = params.get("title") || "Untitled Scape";
  const description = params.get("description") || "";

  useEffect(() => {
    void fetch("/api/templates")
      .then((response) => response.ok ? response.json() : undefined)
      .then((data: { templates?: Template[] } | undefined) => { if (data?.templates?.length) setTemplates(data.templates); })
      .catch(() => undefined);
  }, []);

  function createScape(template: Template) {
    const id = newId(title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "scape");
    const thumbnail = sessionStorage.getItem("deepscapes-draft-thumbnail");
    sessionStorage.removeItem("deepscapes-draft-thumbnail");
    const resources = template.sections.map((section, index) => ({
      id: `starter-${index}`,
      title: section,
      type: index === 2 ? "task" as const : "note" as const,
      detail: index === 2 ? "Task · Not started" : "Note",
      date: "Just now",
    }));
    const scape: Scape = {
      id, title, description, template: template.name, cover: thumbnail || template.color,
      updated: "Just created", resources,
      activity: [{ id: "created", action: "Scape created", detail: template.name, time: "Just now" }],
      ownerId: user?.id,
      collaborators: user?.email ? [{ id: user.id, name: typeof user.user_metadata.username === "string" ? user.user_metadata.username : user.email.split("@")[0], email: user.email, permission: "edit" }] : [],
    };
    addScape(scape);
    router.push(`/workspace/${id}`);
  }

  return <main className="min-h-screen"><AppHeader compact /><section className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10"><Link href="/create" className="text-sm text-[#718077] hover:text-[#17231d]">← Back</Link><div className="mt-8 max-w-2xl"><p className="text-sm font-medium uppercase tracking-[.18em] text-[#718077]">Choose a template</p><h1 className="mt-3 text-4xl font-medium tracking-[-.055em] sm:text-5xl">Start with a<br /><em className="font-serif font-normal">clear structure.</em></h1><p className="mt-4 text-[#718077]">Select a template or begin with a blank Scape.</p></div><div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{templates.map((template) => <button onClick={() => createScape(template)} key={template.name} className="group rounded-2xl border border-[#e5e8e2] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><span className="template-swatch grid h-10 w-10 place-items-center rounded-xl text-lg" style={{ background: template.color }}>{template.icon}</span><h2 className="mt-6 font-semibold tracking-[-.03em]">{template.name}</h2><p className="mt-2 min-h-10 text-sm leading-5 text-[#718077]">{template.description}</p><span className="mt-5 inline-block text-sm font-medium text-[#315443]">Use template →</span></button>)}</div></section></main>;
}
