import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { cleanText, generatePublicId, hashPassword, isEmail } from "@/lib/utils";
import { deviceLabel, platformOf } from "@/lib/device";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const limited = rateLimit(clientKey(request, "register"), 8, 10 * 60 * 1000);
    if (!limited.ok) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const email = cleanText(body.email, 255).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    const displayName = cleanText(body.displayName, 80);
    const locale = body.locale === "en" ? "en" : "ar";

    if (!isEmail(email)) return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "weak_password" }, { status: 400 });
    if (displayName.length < 2) {
      return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);

    let created: { id: number; publicId: string } | undefined;
    for (let attempt = 0; attempt < 6 && !created; attempt += 1) {
      const publicId = generatePublicId(8);
      try {
        const rows = await db
          .insert(users)
          .values({
            publicId,
            email,
            passwordHash,
            displayName,
            locale,
            about: locale === "ar" ? "مرحباً! أنا أستخدم رسالة." : "Hey there! I'm using Risala.",
          })
          .returning({ id: users.id, publicId: users.publicId });
        created = rows[0];
      } catch (error) {
        // 23505 = unique violation (public id collision) → retry with a new id.
        if ((error as { code?: string }).code !== "23505") throw error;
      }
    }

    if (!created) {
      return NextResponse.json({ error: "id_generation_failed" }, { status: 500 });
    }

    const session = await createSession(
      created.id,
      deviceLabel(request.headers.get("user-agent")),
      platformOf(request.headers.get("user-agent")),
    );

    const response = NextResponse.json({
      ok: true,
      user: { id: created.id, publicId: created.publicId, displayName, email },
    });
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("[register]", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}


