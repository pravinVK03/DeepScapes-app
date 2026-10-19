import { RequireAuth } from "@/components/auth/require-auth";
import HomeScreen from "@/components/scape/home-screen";

export default function ScapesPage() {
  return <RequireAuth><HomeScreen /></RequireAuth>;
}
