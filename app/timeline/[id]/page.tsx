import TimelineScreen from "@/components/scape/timeline-screen";
import { RequireAuth } from "@/components/auth/require-auth";
export default function Page() { return <RequireAuth><TimelineScreen /></RequireAuth>; }
