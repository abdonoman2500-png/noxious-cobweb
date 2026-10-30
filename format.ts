import type { Locale } from "@/lib/types";

export function timeAgo(input: string | Date, locale: Locale): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return locale === "ar" ? "الآن" : "now";
  if (minutes < 60) return locale === "ar" ? `قبل ${minutes} د` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === "ar" ? `قبل ${hours} س` : `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return locale === "ar" ? `قبل ${days} ي` : `${days}d`;
  return date.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function formatClock(input: string | Date, locale: Locale): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return date.toLocaleTimeString(locale === "ar" ? "ar-EG" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dayLabel(input: string | Date, locale: Locale): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(date, today)) return locale === "ar" ? "اليوم" : "Today";
  if (same(date, yesterday)) return locale === "ar" ? "أمس" : "Yesterday";
  return date.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileKindFromMime(mime: string): "image" | "video" | "audio" | "document" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}
