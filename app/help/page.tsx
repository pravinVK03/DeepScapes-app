import Link from "next/link";
import { RequireAuth } from "@/components/auth/require-auth";
import { AppHeader } from "@/components/ui/app-header";
import { Icon } from "@/components/ui/icons";

const questions = [
  ["What is a Scape?", "A Scape is a focused workspace for one project, idea, or area of research. It can hold notes, tasks, links, files, media, activity, and collaborative context."],
  ["How does search work?", "Search on Your Scapes checks each Scape’s name, description, and template. Use Ctrl or Command + K to focus it quickly, then Escape to clear it."],
  ["How do I organize a Scape?", "Use Add section to reveal an available workspace area, and Add media to add notes, tasks, links, files, images, videos, or audio. Files can be grouped while adding them."],
  ["What happens when I archive or delete a Scape?", "Archiving hides a Scape from Recent Scapes and keeps it restorable. Deleting permanently removes it, so use archive when you may need it again."],
  ["How does collaboration work?", "Use Share in a Scape to invite a person as a viewer or editor. Editors can update the Scape; viewers can review the shared workspace."],
  ["Does the in-app browser cost anything?", "Remote browsing uses a metered Steel session. It only starts when you select Open, never while simply viewing a Scape. Finish with Save & end when you are done; your safe session checkpoint remains available to resume later."],
  ["Why can a website fail to load in the browser?", "Some websites block remote browsers, require their own sign-in, or have restrictive security policies. Try Repair connection or open another source. DeepScapes saves a checkpoint before recovery so you do not need to restart your research."],
];

function HelpCenter() {
  return <main className="min-h-screen"><AppHeader />
    <section className="mx-auto max-w-5xl px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
      <Link href="/scapes" className="inline-flex items-center gap-2 text-sm text-[#718077] hover:text-[#315443]"><Icon name="back" className="h-4 w-4" />Back to your Scapes</Link>
      <p className="mt-12 text-sm font-medium uppercase tracking-[.18em] text-[#718077]">Help center</p>
      <h1 className="mt-4 max-w-3xl text-5xl font-medium tracking-[-.065em] text-[#17231d] sm:text-7xl">Make space for<br /><em className="font-serif font-normal">better work.</em></h1>
      <p className="mt-6 max-w-2xl text-base leading-7 text-[#718077]">A short guide to getting started, keeping a Scape organized, collaborating safely, and using remote browsing without wasting time or credits.</p>

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        <Link href="/create" className="rounded-2xl border border-[#e5e8e2] bg-white p-5 transition hover:-translate-y-0.5 hover:bg-[#edf0df]"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#edf0df] text-[#315443]"><Icon name="plus" className="h-5 w-5" /></span><h2 className="mt-5 font-semibold">Start a Scape</h2><p className="mt-2 text-sm leading-6 text-[#718077]">Begin blank or choose a structure that fits your work.</p></Link>
        <Link href="/templates" className="rounded-2xl border border-[#e5e8e2] bg-white p-5 transition hover:-translate-y-0.5 hover:bg-[#edf0df]"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#edf0df] text-[#315443]"><Icon name="folder" className="h-5 w-5" /></span><h2 className="mt-5 font-semibold">Explore templates</h2><p className="mt-2 text-sm leading-6 text-[#718077]">Use a practical starting point, then make it your own.</p></Link>
      </div>

      <div className="mt-14 border-t border-[#e5e8e2] pt-10"><p className="text-sm font-medium uppercase tracking-[.18em] text-[#718077]">A simple flow</p><div className="mt-6 grid gap-4 md:grid-cols-4">{[["1", "Create", "Name a Scape and choose a blank workspace or template."], ["2", "Organize", "Add sections, media, groups, notes, and tasks as needed."], ["3", "Collaborate", "Invite people with the right viewer or editor access."], ["4", "Research", "Open a browser session only when you need it, then save and end it."]].map(([number, title, copy]) => <div key={number} className="rounded-2xl bg-[#f2f4ed] p-5"><span className="text-xs font-medium text-[#315443]">{number}</span><h2 className="mt-5 font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-[#718077]">{copy}</p></div>)}</div></div>

      <div className="mt-14 border-t border-[#e5e8e2] pt-10"><p className="text-sm font-medium uppercase tracking-[.18em] text-[#718077]">Frequently asked questions</p><div className="mt-5 divide-y divide-[#e5e8e2] rounded-2xl border border-[#e5e8e2] bg-white px-5">{questions.map(([question, answer]) => <details key={question} className="group py-1"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium [&::-webkit-details-marker]:hidden"><span>{question}</span><span className="text-xl text-[#718077] transition group-open:rotate-45">+</span></summary><p className="max-w-3xl pb-5 text-sm leading-6 text-[#718077]">{answer}</p></details>)}</div></div>

      <div className="mt-12 rounded-2xl bg-[#315443] p-6 text-white sm:p-8"><p className="text-sm text-white/70">Still need a hand?</p><h2 className="mt-2 text-2xl font-semibold">Your feedback improves DeepScapes.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-white/75">Tell us what felt unclear or did not work. Feedback is saved with your account so it can be reviewed and acted on.</p><Link href="/scapes#feedback" className="mt-5 inline-flex rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-[#17231d]">Leave feedback</Link></div>
    </section>
  </main>;
}

export default function HelpPage() {
  return <RequireAuth><HelpCenter /></RequireAuth>;
}
