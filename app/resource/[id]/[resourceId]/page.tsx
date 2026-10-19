import ResourceViewer from "@/components/resource/resource-viewer";
import { RequireAuth } from "@/components/auth/require-auth";
export default function Page() { return <RequireAuth><ResourceViewer /></RequireAuth>; }
