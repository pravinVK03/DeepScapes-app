import { AuthScreen } from "@/components/auth/auth-screen";
import { Suspense } from "react";

export default function Home() {
  return <Suspense fallback={<main className="min-h-screen bg-[#0d0d0d]" />}><AuthScreen mode="login" /></Suspense>;
}
