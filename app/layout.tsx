import type { Metadata } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";
import { NotificationCenter } from "@/components/ui/notification-center";

export const metadata: Metadata = {
  title: "DeepScapes",
  description: "A calm, project-centric workspace.",
  verification: {
    google: "zB6ZqMBsQ3dhHpen4ot1MRDm3Cr4L5dViRjefLqSIww",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try { const saved = localStorage.getItem("deepscapes-theme"); const dark = saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches); document.documentElement.classList.toggle("dark", dark); } catch {}`,
          }}
        />
      </head>
      <body>
        <AuthProvider><NotificationCenter>{children}</NotificationCenter></AuthProvider>
        <Analytics />
        <Script id="google-analytics" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-FZZSFW8W4N');`}
        </Script>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-FZZSFW8W4N"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
