import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { passwordResets, users } from "@/db/schema";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { cleanText, isEmail, randomToken, sha256 } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Password recovery. This deployment has no transactional email provider
 * configured, so the single-use link is returned in the response (clearly
 * labelled) instead of being mailed. Swap `deliverResetLink` for your ESP
 * (Resend/SES/Postmark) in production.
 */
export async function POST(request: Request) {
  try {
    const limited = rateLimit(clientKey(request, "recover"), 6, 10 * 60 * 1000);
    if (!limited.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const email = cleanText(body.email, 255).toLowerCase();
    if (!isEmail(email)) return NextResponse.json({ error: "invalid_email" }, { status: 400 });

    const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];

    if (user) {
      const token = randomToken(24);
      await db.insert(passwordResets).values({
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });
      const origin = new URL(request.url).origin;
      return NextResponse.json({
        ok: true,
        delivered: false,
        resetUrl: `${origin}/recover?token=${token}`,
        note: "no_email_provider",
      });
    }

    return NextResponse.json({ ok: true, delivered: false, resetUrl: null });
  } catch (error) {
    console.error("[recover]", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
