import { NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { passwordResets, sessions, users } from "@/db/schema";
import { getAuthUser } from "@/lib/session";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { hashPassword, sha256, verifyPassword } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Change password (logged in) or complete a recovery (token). */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const token = typeof body.token === "string" ? body.token : "";
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "weak_password" }, { status: 400 });
    }

    const passwordHash = await hashPassword(newPassword);

    if (token) {
      const limited = rateLimit(clientKey(request, "reset"), 10, 10 * 60 * 1000);
      if (!limited.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

      const rows = await db
        .select()
        .from(passwordResets)
        .where(
          and(
            eq(passwordResets.tokenHash, sha256(token)),
            isNull(passwordResets.usedAt),
            gt(passwordResets.expiresAt, new Date()),
          ),
        )
        .limit(1);
      const reset = rows[0];
      if (!reset) return NextResponse.json({ error: "invalid_token" }, { status: 400 });

      await db.update(users).set({ passwordHash }).where(eq(users.id, reset.userId));
      await db
        .update(passwordResets)
        .set({ usedAt: new Date() })
        .where(eq(passwordResets.id, reset.id));
      // Revoke every session after a credential change.
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.userId, reset.userId));
      return NextResponse.json({ ok: true });
    }

    const current = await getAuthUser();
    if (!current) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const rows = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, current.id))
      .limit(1);
    if (!rows[0] || !(await verifyPassword(String(body.currentPassword ?? ""), rows[0].passwordHash))) {
      return NextResponse.json({ error: "invalid_password" }, { status: 400 });
    }

    await db.update(users).set({ passwordHash }).where(eq(users.id, current.id));
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.userId, current.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[password]", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
