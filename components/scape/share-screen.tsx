"use client";

import { useParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/ui/app-header";
import { saveScape, useScape } from "@/lib/scape-store";
import { ShareScape } from "./share-scape";

export default function ShareScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const scape = useScape(id);
  if (!scape) return <main className="min-h-screen"><AppHeader /></main>;
  return <main className="min-h-screen"><AppHeader /><ShareScape scape={scape} save={saveScape} close={() => router.push(`/workspace/${id}`)} /></main>;
}
