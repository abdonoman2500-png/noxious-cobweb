import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "رسالة · Risala",
    short_name: "رسالة",
    description: "مراسلة فورية بهوية رقمية فريدة — Email-based messaging with a unique ID.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0b1120",
    theme_color: "#0f766e",
    dir: "rtl",
    lang: "ar",
    categories: ["social", "communication", "productivity"],
    icons: [
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "الدردشات", url: "/app?tab=chats" },
      { name: "الحالة", url: "/app?tab=status" },
      { name: "الإعدادات", url: "/app?tab=settings" },
    ],
  };
}
