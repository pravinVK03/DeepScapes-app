import TemplateGallery from "@/components/scape/template-gallery";
import { Suspense } from "react";

export default function Page() {
  return <Suspense fallback={<main className="min-h-screen bg-[#f7f7f3]" />}><TemplateGallery /></Suspense>;
}
