"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/ui/app-header";
import { loadRemoteScape, saveScape, useScape } from "@/lib/scape-store";
import { ShareScape } from "./share-scape";
import { useAuth } from "@/components/auth/auth-provider";

export default function ShareScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const scape = useScape(id);
  const [loading, setLoading] = useState(!scape);

  useEffect(() => {
    if (!id || scape) return;
    let active = true;
    void loadRemoteScape(id).then(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [id, scape]);

  if (loading && !scape) {
    return (
      <main className="min-h-screen">
        <AppHeader />
        <section className="mx-auto max-w-xl px-5 py-20 text-center">
          <p className="text-sm font-medium">Loading sharing settings…</p>
        </section>
      </main>
    );
  }

  if (!scape) {
    return (
      <main className="min-h-screen">
        <AppHeader />
        <section className="mx-auto max-w-xl px-5 py-16 text-center">
          <p className="text-sm font-medium">Scape not found</p>
          <button onClick={() => router.push("/scapes")} className="mt-4 rounded-lg bg-[#315443] px-4 py-2 text-sm text-white">Return to Scapes</button>
        </section>
      </main>
    );
  }

  if (scape.ownerId && scape.ownerId !== user?.id) {
    return (
      <main className="min-h-screen">
        <AppHeader />
        <section className="mx-auto max-w-xl px-5 py-16 sm:px-8">
          <h1 className="text-2xl font-semibold">Only the owner can manage sharing</h1>
          <p className="mt-3 text-sm text-[#718077]">You can still view this Scape, but its collaborators and permissions are managed by its owner.</p>
          <button onClick={() => router.push(`/workspace/${id}`)} className="mt-6 rounded-lg border px-4 py-2 text-sm">Return to the Scape</button>
        </section>
      </main>
    );
  }

  return <main className="min-h-screen"><AppHeader /><ShareScape scape={scape} save={saveScape} close={() => router.push(`/workspace/${id}`)} /></main>;
}
