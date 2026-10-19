import CreateScape from "@/components/scape/create-scape";
import { RequireAuth } from "@/components/auth/require-auth";
export default function Page() { return <RequireAuth><CreateScape /></RequireAuth>; }
