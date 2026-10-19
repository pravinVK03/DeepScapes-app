import WorkspaceScreen from "@/components/scape/workspace-screen";
import { RequireAuth } from "@/components/auth/require-auth";
export default function Page() { return <RequireAuth><WorkspaceScreen /></RequireAuth>; }
