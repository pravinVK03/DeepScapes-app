"use client";

import { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { PageLoader } from "@/components/ui/page-loader";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, profileReady } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, pathname, router, user]);

  if (loading || !user || !profileReady) {
    return <PageLoader title={loading || !user ? "Securing your sign-in…" : "Preparing your profile…"} description={loading || !user ? "Checking your session before we continue." : "Applying your saved profile and preferences."} previous={loading || !user ? "Sign in" : "Profile"} next="Your Scapes" />;
  }

  return <>{children}</>;
}
