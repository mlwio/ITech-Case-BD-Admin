import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AntiInspectGuard } from "@/components/security/anti-inspect-guard";

export const metadata: Metadata = {
  title: {
    default: "ITech Case BD — Order Management Suite",
    template: "%s · ITech Case BD",
  },
  description:
    "Mobile-first E-Commerce & F-Commerce order management for ITech Case BD — Messenger, WhatsApp & TikTok orders, Pathao courier and BDT hisab in one place.",
  applicationName: "ITech Case BD",
  appleWebApp: {
    capable: true,
    title: "ITech Case BD",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "light dark",
  themeColor: "#4f46e5",
};

/**
 * Applies the saved (or system) colour scheme before first paint so the app
 * never flashes the wrong theme. Kept inline and dependency-free on purpose.
 */
const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem("itech-theme");var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d){document.documentElement.classList.add("dark");}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
        <AntiInspectGuard />
      </body>
    </html>
  );
}
