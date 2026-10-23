import { ProfileSettings } from "@/components/auth/profile-settings";
import { RequireAuth } from "@/components/auth/require-auth";

export default function ProfileSettingsPage() {
  return <RequireAuth><ProfileSettings /></RequireAuth>;
}
