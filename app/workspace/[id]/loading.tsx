export default function Loading() {
  return <main className="min-h-screen bg-[#f7f7f3]"><header className="h-20 border-b border-[#e5e8e2]" /><section className="mx-auto max-w-7xl px-5 py-8 sm:px-8"><div className="h-4 w-24 animate-pulse rounded bg-[#e5e8e2]" /><div className="mt-5 h-48 animate-pulse rounded-[1.75rem] bg-[#e5e8e2]" /><div className="mt-7 grid gap-3 md:grid-cols-2">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl border border-[#e5e8e2] bg-white" />)}</div></section></main>;
}
