"use client";

import { useEffect, useState } from "react";
import { NavigationProgress } from "./navigation-progress";
import { PageLoader } from "./page-loader";

type DeferredPageLoaderProps = {
  title: string;
  description: string;
  delay?: number;
  showMessage?: boolean;
};

// Route fallbacks render immediately in Next. Keep the first moment quiet and
// show the branded screen only when a real wait is taking place.
export function DeferredPageLoader({ title, description, delay = 750, showMessage = true }: DeferredPageLoaderProps) {
  const [showLoader, setShowLoader] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowLoader(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);

  return showLoader ? <PageLoader title={title} description={description} showMessage={showMessage} /> : <NavigationProgress />;
}
