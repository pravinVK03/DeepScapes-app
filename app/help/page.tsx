"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { AppHeader } from "@/components/ui/app-header";
import { Icon } from "@/components/ui/icons";

const questions = [
  ["What is a Scape?", "A Scape is a focused workspace for one project, idea, or area of research. It keeps notes, tasks, links, files, media, activity, and collaborators in one place."],
  ["How does search work?", "Search checks each Scape’s name, description, and template. Press Ctrl + K on Windows or Command + K on macOS to focus it, and Escape to clear it."],
  ["How do I organize a Scape?", "Use Add section to reveal a workspace area, then Add media for notes, tasks, links, files, images, video, or audio. You can add groups while uploading to keep related resources together."],
  ["What happens when I archive or delete a Scape?", "Archiving hides a Scape from Recent Scapes but keeps every resource and thumbnail intact. Restore brings it back exactly as it was. Deleting is permanent, so archive anything you might need later."],
  ["How do I collaborate safely?", "Choose Share inside a Scape and invite someone as a viewer or editor. Viewers can review the workspace; editors can update it. You can remove access whenever needed."],
  ["Does the in-app browser use credits?", "A Steel browser session starts only when you choose Open. Viewing a Scape does not start one. Save & end when you finish; DeepScapes stores a safe checkpoint you can resume later."],
  ["Why can a website fail to load in the browser?", "Some websites block remote browsers, require their own sign-in, or have restrictive security policies. Try Repair connection or another source. Your last saved checkpoint is kept before recovery."],
];

const flows = [
  { title: "Find a Scape", copy: "Search by project name, description, or template. The shortcut keeps your workspace within reach.", image: "/help/search-scapes.png", alt: "DeepScapes search field" },
  { title: "Choose a starting point", copy: "Start blank when you need freedom, or choose a template for a clear first structure.", image: "/help/choose-template.png", alt: "DeepScapes template selection screen" },
  { title: "Make it yours", copy: "Give the Scape a useful name and a short description. You can change these later as the work grows.", image: "/help/name-your-scape.png", alt: "DeepScapes new Scape details screen" },
];

function HelpCenter() {
  const [query, setQuery] = useState("");
  const [openQuestion, setOpenQuestion] = useState(0);
  const [flow, setFlow] = useState(0);
  const matchingQuestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return questions.filter(([question, answer]) => !normalized || `${question} ${answer}`.toLowerCase().includes(normalized));
  }, [query]);
  const selectedFlow = flows[flow];

  return <main className="min-h-screen"><AppHeader />
    <section className="mx-auto max-w-5xl px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
      <Link href="/scapes" className="inline-flex items-center gap-2 text-sm text-[#718077] hover:text-[#315443]"><Icon name="back" className="h-4 w-4" />Back to your Scapes</Link>
      <p className="mt-12 text-sm font-medium uppercase tracking-[.18em] text-[#718077]">Help center</p>
      <h1 className="mt-4 max-w-3xl text-5xl font-medium tracking-[-.065em] text-[#17231d] sm:text-7xl">Answers first.<br /><em className="font-serif font-normal">Better work next.</em></h1>
      <p className="mt-6 max-w-2xl text-base leading-7 text-[#718077]">Find the answer you need, then follow the guided product flows when you are ready to explore.</p>

      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        <Link href="/create" className="group rounded-2xl border border-[#e5e8e2] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#315443] hover:bg-[#edf0df]"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#edf0df] text-[#315443] transition group-hover:bg-[#315443] group-hover:text-white"><Icon name="plus" className="h-5 w-5" /></span><h2 className="mt-5 font-semibold">Start a Scape</h2><p className="mt-2 text-sm leading-6 text-[#718077]">Begin blank or choose a structure that fits your work.</p></Link>
        <Link href="/scapes#feedback" className="group rounded-2xl border border-[#e5e8e2] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#315443] hover:bg-[#edf0df]"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#edf0df] text-[#315443] transition group-hover:bg-[#315443] group-hover:text-white"><Icon name="help" className="h-5 w-5" /></span><h2 className="mt-5 font-semibold">Share feedback</h2><p className="mt-2 text-sm leading-6 text-[#718077]">Tell us what feels unclear, missing, or unexpectedly difficult.</p></Link>
      </div>

      <section className="mt-14 border-t border-[#e5e8e2] pt-10" aria-labelledby="faq-heading">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium uppercase tracking-[.18em] text-[#718077]">Frequently asked questions</p><h2 id="faq-heading" className="mt-2 text-3xl font-medium tracking-[-.045em]">Start with the answer.</h2></div><label className="relative block sm:w-72"><span className="sr-only">Search help topics</span><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#718077]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search help" className="w-full rounded-xl border border-[#dce1d9] bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-[#315443] focus:ring-4 focus:ring-[#315443]/10" /></label></div>
        <div className="mt-6 divide-y divide-[#e5e8e2] overflow-hidden rounded-2xl border border-[#e5e8e2] bg-white">{matchingQuestions.map(([question, answer]) => { const sourceIndex = questions.findIndex(([sourceQuestion]) => sourceQuestion === question); const isOpen = openQuestion === sourceIndex; return <article key={question}><button type="button" onClick={() => setOpenQuestion(isOpen ? -1 : sourceIndex)} aria-expanded={isOpen} className="flex w-full items-center justify-between gap-5 px-5 py-5 text-left font-medium transition hover:bg-[#f7f8f4]"><span>{question}</span><span aria-hidden="true" className={`text-xl text-[#718077] transition ${isOpen ? "rotate-45 text-[#315443]" : ""}`}>+</span></button>{isOpen && <p className="max-w-3xl px-5 pb-5 text-sm leading-6 text-[#718077]">{answer}</p>}</article>; })}</div>
        {!matchingQuestions.length && <p className="mt-5 rounded-xl border border-dashed border-[#cbd3ca] bg-[#f7f8f4] p-5 text-sm text-[#718077]">No help topic matches “{query}”. Try a shorter word, or send feedback so we can add the answer.</p>}
      </section>

      <section className="mt-14 border-t border-[#e5e8e2] pt-10" aria-labelledby="flows-heading">
        <p className="text-sm font-medium uppercase tracking-[.18em] text-[#718077]">Feature flows</p><h2 id="flows-heading" className="mt-2 text-3xl font-medium tracking-[-.045em]">See the path before you take it.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-[#718077]">Choose a flow to preview the key screen, then continue directly into DeepScapes.</p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">{flows.map((item, index) => <button key={item.title} type="button" onClick={() => setFlow(index)} aria-pressed={index === flow} className={`rounded-2xl border p-5 text-left transition ${index === flow ? "border-[#315443] bg-[#edf0df] shadow-sm" : "border-[#e5e8e2] bg-white hover:border-[#aab4aa] hover:bg-[#f7f8f4]"}`}><span className="text-xs font-medium text-[#315443]">0{index + 1}</span><h3 className="mt-4 font-semibold">{item.title}</h3><p className="mt-2 text-sm leading-6 text-[#718077]">{item.copy}</p></button>)}</div>
        <figure className="mt-6 overflow-hidden rounded-2xl border border-[#e5e8e2] bg-[#f7f8f4]"><div className="relative aspect-[16/9] min-h-52"><Image src={selectedFlow.image} alt={selectedFlow.alt} fill sizes="(max-width: 768px) 100vw, 960px" className="object-contain object-center" /></div><figcaption className="flex flex-col gap-3 border-t border-[#e5e8e2] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><span><strong className="font-semibold">{selectedFlow.title}</strong><span className="mt-1 block text-sm text-[#718077]">{selectedFlow.copy}</span></span>{flow === 0 ? <Link href="/scapes" className="shrink-0 text-sm font-medium text-[#315443] hover:underline">Go to your Scapes →</Link> : <Link href={flow === 1 ? "/templates" : "/create"} className="shrink-0 text-sm font-medium text-[#315443] hover:underline">Try this flow →</Link>}</figcaption></figure>
      </section>

      <section className="mt-12 rounded-2xl bg-[#315443] p-6 text-white sm:p-8"><p className="text-sm text-white/70">Still need a hand?</p><h2 className="mt-2 text-2xl font-semibold">Your feedback improves DeepScapes.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-white/75">Tell us what felt unclear or did not work. Feedback is saved with your account so it can be reviewed and acted on.</p><Link href="/scapes#feedback" className="mt-5 inline-flex rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-[#17231d]">Leave feedback</Link></section>
    </section>
  </main>;
}

export default function HelpPage() {
  return <RequireAuth><HelpCenter /></RequireAuth>;
}
