import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { blocks, reports, users } from "@/db/schema";
import { errorResponse, HttpError, requireAuthUser } from "@/lib/session";
import { cleanText, normalizePublicId } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const me = await requireAuthUser();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const publicId = normalizePublicId(String(body.publicId ?? ""));
    if (publicId.length < 6) throw new HttpError(400, "invalid_public_id");

    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.publicId, publicId))
      .limit(1);
    const target = rows[0];
    if (!target) throw new HttpError(404, "not_found");
    if (target.id === me.id) throw new HttpError(400, "own_id");

    if (action === "block") {
      await db
        .insert(blocks)
        .values({ blockerId: me.id, blockedId: target.id })
        .onConflictDoNothing();
      return NextResponse.json({ ok: true, blocked: true });
    }
    if (action === "unblock") {
      await db
        .delete(blocks)
        .where(and(eq(blocks.blockerId, me.id), eq(blocks.blockedId, target.id)));
      return NextResponse.json({ ok: true, blocked: false });
    }
    if (action === "report") {
      const reason = cleanText(body.reason, 60) || "other";
      const details = cleanText(body.details, 1000);
      await db.insert(reports).values({
        reporterId: me.id,
        targetUserId: target.id,
        reason,
        details,
      });
      return NextResponse.json({ ok: true, reported: true });
    }
    throw new HttpError(400, "invalid_action");
  } catch (error) {
    return errorResponse(error);
  }
}
