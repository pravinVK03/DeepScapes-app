import Link from "next/link";
import Image from "next/image";

export function SplashScreen() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#0a0a0a] px-5 text-white">
      <div className="pointer-events-none absolute -left-32 top-1/4 h-80 w-80 rounded-full bg-white/[0.04] blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-white/[0.035] blur-3xl" />

      <section className="relative w-full max-w-xl rounded-[2rem] border border-white/10 bg-white/[0.035] p-8 text-center shadow-2xl shadow-black/30 sm:p-12">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-white/15 bg-white/[0.06] text-xl">
          ↘
        </div>
        <Image
          src="/deepscapes-logo-white.png"
          alt="DeepScapes"
          width={384}
          height={117}
          priority
          className="mx-auto mt-7 h-auto w-64 max-w-full object-contain"
        />
        <p className="mx-auto mt-8 max-w-sm text-base leading-7 text-white/60">
          Everything for a project, held together in one focused space.
        </p>

        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/signup" className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/85">
            Create your space
          </Link>
          <Link href="/login" className="rounded-xl border border-white/15 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/[0.08]">
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
