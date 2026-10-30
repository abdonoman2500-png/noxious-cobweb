import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "رسالة · Risala",
    template: "%s · رسالة",
  },
  description:
    "منصة مراسلة احترافية تعتمد البريد الإلكتروني ومعرّفاً رقمياً فريداً — Professional email-based messaging platform.",
  manifest: "/manifest.webmanifest",
  applicationName: "رسالة",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "رسالة",
  },
  icons: {
    icon: [{ url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/icons/icon-512.png", sizes: "512x512" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f766e",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const locale = store.get("locale")?.value === "en" ? "en" : "ar";
  const theme = store.get("theme")?.value === "dark" ? "dark" : "light";

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} data-theme={theme}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
