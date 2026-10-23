import { PageLoader } from "@/components/ui/page-loader";

export default function Loading() {
  return <PageLoader title="Restoring your Scapes…" description="Bringing back your latest workspace." previous="Account ready" next="Your workspace" />;
}
