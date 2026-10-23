import { PageLoader } from "@/components/ui/page-loader";

export default function Loading() {
  return <PageLoader title="Getting sign-in ready…" description="Preparing a secure way back to your Scapes." previous="Welcome" next="Sign in" />;
}
