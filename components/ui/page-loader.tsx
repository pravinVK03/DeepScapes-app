import Image from "next/image";

export function PageLoader() {
  return <main className="page-loader grid min-h-screen place-items-center" aria-label="Loading"><div className="w-full max-w-sm px-6 text-center"><Image src="/deepscapes-logo-black.png" alt="DeepScapes" width={228} height={45} className="page-loader-logo logo-light mx-auto h-auto w-44" priority /><Image src="/deepscapes-logo-white.png" alt="DeepScapes" width={228} height={45} className="page-loader-logo logo-dark mx-auto h-auto w-44" priority /><div className="page-loader-line mx-auto mt-10 h-1 w-full overflow-hidden rounded-full"><span className="block h-full rounded-full" /></div></div></main>;
}
