import { PageLoader } from "@/components/ui/page-loader";

export default function Loading() {
  return <PageLoader title="Starting your sign-up…" description="Preparing the first step toward your Scapes." previous="Welcome" next="Your account" />;
}
