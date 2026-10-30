import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getAuthUser } from "@/lib/session";
import { cleanText } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ user });
}

export async function PATCH(request: Request) {
  const current = await getAuthUser();
  if (!current) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof body.displayName === "string") {
    const name = cleanText(body.displayName, 80);
    if (name.length < 2) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    patch.displayName = name;
  }
  if (typeof body.about === "string") patch.about = cleanText(body.about, 160);
  if (typeof body.avatarUrl === "string" || body.avatarUrl === null) {
    patch.avatarUrl = body.avatarUrl ? cleanText(body.avatarUrl, 300) : null;
  }
  if (body.locale === "ar" || body.locale === "en") patch.locale = body.locale;
  if (body.theme === "light" || body.theme === "dark") patch.theme = body.theme;
  if (typeof body.wallpaper === "string") patch.wallpaper = cleanText(body.wallpaper, 24);
  if (
    body.lastSeenVisibility === "everyone" ||
    body.lastSeenVisibility === "contacts" ||
    body.lastSeenVisibility === "nobody"
  ) {
    patch.lastSeenVisibility = body.lastSeenVisibility;
  }
  if (
    body.profileVisibility === "everyone" ||
    body.profileVisibility === "contacts" ||
    body.profileVisibility === "nobody"
  ) {
    patch.profileVisibility = body.profileVisibility;
  }
  if (typeof body.readReceipts === "boolean") patch.readReceipts = body.readReceipts;
  if (typeof body.pushEnabled === "boolean") patch.pushEnabled = body.pushEnabled;

  const [updated] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, current.id))
    .returning();

  const response = NextResponse.json({ ok: true, user: updated });
  if (updated.locale === "ar" || updated.locale === "en") {
    response.cookies.set("locale", updated.locale, { path: "/", maxAge: 31536000 });
  }
  response.cookies.set("theme", updated.theme, { path: "/", maxAge: 31536000 });
  return response;
}
