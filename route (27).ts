import { NextResponse } from "next/server";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { media, statuses } from "@/db/schema";
import { errorResponse, HttpError, requireAuthUser } from "@/lib/session";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/utils";
import { publishToUsers } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const me = await requireAuthUser();
    const limited = rateLimit(clientKey(request, "status", me.id), 20, 60 * 60 * 1000);
    if (!limited.ok) throw new HttpError(429, "rate_limited");

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const kind = ["text", "image", "video"].includes(String(body.kind))
      ? (String(body.kind) as "text" | "image" | "video")
      : "text";
    const text = cleanText(body.body, 700);
    const mediaId = typeof body.mediaId === "string" ? body.mediaId : null;
    const background = cleanText(body.background, 24) || "grad-1";
    const audience = body.audience === "contacts" ? "contacts" : "everyone";

    if (kind === "text" && !text) throw new HttpError(400, "empty_status");
    if (kind !== "text" && !mediaId) throw new HttpError(400, "missing_media");

    if (mediaId) {
      const rows = await db
        .select({ id: media.id, ownerId: media.ownerId })
        .from(media)
        .where(eq(media.id, mediaId))
        .limit(1);
      if (!rows[0] || rows[0].ownerId !== me.id) throw new HttpError(403, "media_not_owned");
    }

    const [created] = await db
      .insert(statuses)
      .values({
        userId: me.id,
        kind,
        body: text,
        mediaId,
        background,
        audience,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning();

    // Notify everyone the author shares a conversation with.
    const peerRes = await db.execute(sql`
      select distinct cm2.user_id as user_id
      from conversation_members cm
      join conversation_members cm2 on cm2.conversation_id = cm.conversation_id
      where cm.user_id = ${me.id} and cm2.user_id <> ${me.id}
    `);
    const peerIds = (peerRes.rows as unknown as { user_id: number }[]).map((r) =>
      Number(r.user_id),
    );
    publishToUsers(peerIds, { type: "status:new", payload: { userId: me.id } });

    return NextResponse.json({ status: { id: created.id, expiresAt: created.expiresAt } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET() {
  try {
    const me = await requireAuthUser();
    const rows = await db
      .select()
      .from(statuses)
      .where(and(gt(statuses.expiresAt, new Date()), inArray(statuses.audience, ["everyone", "contacts"])));
    return NextResponse.json({ count: rows.length, mine: rows.filter((r) => r.userId === me.id).length });
  } catch (error) {
    return errorResponse(error);
  }
}
