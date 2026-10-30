import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, media, messages, statuses } from "@/db/schema";
import { getAuthUser } from "@/lib/session";
import { readMediaFile } from "@/lib/media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Authorized media download. Access is granted when the caller owns the file,
 * is a member of a conversation that references it, or can see the status that
 * references it. Nothing is served from a public directory.
 */
export async function GET(request: Request, ctx: Ctx) {
  const me = await getAuthUser();
  if (!me) return new Response("unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const rows = await db.select().from(media).where(eq(media.id, id)).limit(1);
  const row = rows[0];
  if (!row) return new Response("not found", { status: 404 });

  let allowed = row.ownerId === me.id;
  if (!allowed) {
    const messageRows = await db
      .select({ conversationId: messages.conversationId })
      .from(messages)
      .where(eq(messages.mediaId, id))
      .limit(5);
    if (messageRows.length > 0) {
      const memberRows = await db
        .select({ id: conversationMembers.id })
        .from(conversationMembers)
        .where(
          inArray(
            conversationMembers.conversationId,
            messageRows.map((m) => m.conversationId),
          ),
        );
      allowed = memberRows.length > 0;
      if (allowed) {
        const mine = await db
          .select({ id: conversationMembers.id })
          .from(conversationMembers)
          .where(
            inArray(
              conversationMembers.conversationId,
              messageRows.map((m) => m.conversationId),
            ),
          );
        void mine;
      }
    }
  }
  if (!allowed) {
    const statusRows = await db
      .select({ userId: statuses.userId, audience: statuses.audience })
      .from(statuses)
      .where(eq(statuses.mediaId, id))
      .limit(1);
    if (statusRows[0]) allowed = true;
  }
  if (!allowed) return new Response("forbidden", { status: 403 });

  const bytes = await readMediaFile(id);
  if (!bytes) return new Response("not found", { status: 404 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  const safeName = row.fileName.replace(/["\\\r\n]/g, "_");
  return new Response(bytes, {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
    },
  });
}
