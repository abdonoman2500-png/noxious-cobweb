import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { cleanText, verifyPassword } from "@/lib/utils";
import { deviceLabel, platformOf } from "@/lib/device";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const email = cleanText(body.email, 255).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";

    const limited = rateLimit(clientKey(request, `login:${email}`), 10, 5 * 60 * 1000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "rate_limited", retryAfter: limited.retryAfter },
        { status: 429 },
      );
    }

    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];
    if (!user) {
      await verifyPassword(password, "scrypt$00$00");
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }

    // Keep the device list bounded: drop the oldest session beyond 10 devices.
    const all = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    if (all.length >= 10) {
      const oldest = all.slice(0, all.length - 9);
      for (const row of oldest) {
        await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, row.id));
      }
    }

    const session = await createSession(
      user.id,
      deviceLabel(request.headers.get("user-agent")),
      platformOf(request.headers.get("user-agent")),
    );

    const response = NextResponse.json({
      ok: true,
      user: { id: user.id, publicId: user.publicId, displayName: user.displayName },
    });
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("[login]", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
