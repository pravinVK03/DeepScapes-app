import { NavigationProgress } from "@/components/ui/navigation-progress";

// The root fallback wraps every route. Keep ordinary navigation lightweight;
// individual blocking flows opt into the branded loader below their own route.
export default function Loading() { return <NavigationProgress />; }
