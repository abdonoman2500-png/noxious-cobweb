import { NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { getAuthUser, revokeAllOtherSessions, revokeSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await db
    .select({
      id: sessions.id,
      deviceName: sessions.deviceName,
      platform: sessions.platform,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)))
    .orderBy(desc(sessions.lastSeenAt));
  return NextResponse.json({
    sessions: rows.map((r) => ({ ...r, current: r.id === user.sessionId })),
  });
}

export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    await revokeAllOtherSessions(user.id, user.sessionId);
    return NextResponse.json({ ok: true, revoked: "others" });
  }
  await revokeSession(Number(id), user.id);
  return NextResponse.json({ ok: true, revoked: Number(id) });
}
