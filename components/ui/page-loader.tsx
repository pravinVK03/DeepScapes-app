import Image from "next/image";

type PageLoaderProps = { title?: string; description?: string; showMessage?: boolean };

export function PageLoader({ title = "Opening DeepScapes…", description = "Putting your workspace in place.", showMessage = false }: PageLoaderProps) {
  return <main className="page-loader grid min-h-screen place-items-center" aria-label={title}><div className="w-full max-w-sm px-6 text-center"><div className="page-loader-mark"><Image src="/deepscapes-logo-black.svg" alt="DeepScapes" width={238} height={59} className="page-loader-logo logo-light mx-auto h-auto w-44" priority /><Image src="/deepscapes-logo-white.svg" alt="DeepScapes" width={238} height={59} className="page-loader-logo logo-dark mx-auto h-auto w-44" priority /></div><div className="page-loader-line mx-auto mt-8 h-1 w-full overflow-hidden rounded-full"><span className="block h-full rounded-full" /></div>{showMessage && <div role="status" aria-live="polite" className="mt-5"><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs text-[#718077]">{description}</p></div>}</div></main>;
}
