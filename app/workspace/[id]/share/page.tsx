import ShareScreen from "@/components/scape/share-screen";
import { RequireAuth } from "@/components/auth/require-auth";

export default function Page() { return <RequireAuth><ShareScreen /></RequireAuth>; }
