import TemplateGallery from "@/components/scape/template-gallery";
import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/require-auth";

export default function Page() {
  return <RequireAuth><Suspense fallback={<main className="min-h-screen bg-[#0d0d0d]" />}><TemplateGallery /></Suspense></RequireAuth>;
}
