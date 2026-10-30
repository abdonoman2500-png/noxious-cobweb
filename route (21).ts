import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  conversationMembers,
  conversations,
  media,
  messageReceipts,
  messages,
  users,
} from "@/db/schema";
import { errorResponse, HttpError, requireAuthUser } from "@/lib/session";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/utils";
import {
  assertMember,
  conversationMemberIds,
  getMessageById,
  hasBlockBetween,
  hydrateMessages,
  listMessages,
  markConversationRead,
  notifyConversation,
  pushToConversation,
} from "@/lib/chat";
import { publishToUsers } from "@/lib/realtime";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const me = await requireAuthUser();
    const { id } = await ctx.params;
    const conversationId = Number(id);
    await assertMember(conversationId, me.id);

    const url = new URL(request.url);
    const before = Number(url.searchParams.get("before") ?? 0) || undefined;
    const limit = Number(url.searchParams.get("limit") ?? 30) || 30;
    const list = await listMessages(conversationId, me.id, { before, limit });
    return NextResponse.json({ messages: list, hasMore: list.length === limit });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const me = await requireAuthUser();
    const { id } = await ctx.params;
    const conversationId = Number(id);
    const membership = await assertMember(conversationId, me.id);

    const limited = rateLimit(clientKey(request, "send", me.id), 60, 60 * 1000);
    if (!limited.ok) throw new HttpError(429, "rate_limited");

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const text = cleanText(body.body, 4000);
    const kind = ["text", "image", "video", "audio", "document"].includes(String(body.kind))
      ? (String(body.kind) as "text" | "image" | "video" | "audio" | "document")
      : "text";
    const mediaId = typeof body.mediaId === "string" ? body.mediaId : null;
    const replyToId = Number(body.replyToId ?? 0) || null;
    const forwardedFromId = Number(body.forwardedFromId ?? 0) || null;
    const clientId = typeof body.clientId === "string" ? body.clientId.slice(0, 64) : null;

    if (kind === "text" && !text) throw new HttpError(400, "empty_message");
    if (kind !== "text" && !mediaId) throw new HttpError(400, "missing_media");

    // Group permission gate.
    if (membership.role !== "admin") {
      const convRows = await db
        .select({ sendPermission: conversations.sendPermission })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);
      if (convRows[0]?.sendPermission === "admins") throw new HttpError(403, "admins_only");
    }

    // Block / report gate for direct conversations.
    const others = (await conversationMemberIds(conversationId)).filter((uid) => uid !== me.id);
    for (const otherId of others) {
      if (await hasBlockBetween(me.id, otherId)) throw new HttpError(403, "blocked");
    }

    if (mediaId) {
      const mediaRows = await db
        .select({ id: media.id, ownerId: media.ownerId })
        .from(media)
        .where(eq(media.id, mediaId))
        .limit(1);
      if (!mediaRows[0] || mediaRows[0].ownerId !== me.id) {
        throw new HttpError(403, "media_not_owned");
      }
    }

    if (forwardedFromId) {
      const original = await db
        .select({ conversationId: messages.conversationId })
        .from(messages)
        .where(eq(messages.id, forwardedFromId))
        .limit(1);
      if (!original[0]) throw new HttpError(404, "original_not_found");
      await assertMember(original[0].conversationId, me.id);
    }

    if (replyToId) {
      const replyRows = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.id, replyToId), eq(messages.conversationId, conversationId)))
        .limit(1);
      if (!replyRows[0]) throw new HttpError(400, "invalid_reply");
    }

    // Idempotent retry: same clientId already stored → return the stored message.
    if (clientId) {
      const existing = await db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            eq(messages.senderId, me.id),
            eq(messages.clientId, clientId),
          ),
        )
        .limit(1);
      if (existing[0]) {
        const dto = await getMessageById(existing[0].id, me.id);
        return NextResponse.json({ message: dto, duplicate: true });
      }
    }

    const [inserted] = await db
      .insert(messages)
      .values({
        conversationId,
        senderId: me.id,
        kind,
        body: text,
        mediaId,
        replyToId,
        forwardedFromId,
        clientId,
      })
      .returning();

    await db
      .update(conversations)
      .set({ lastMessageAt: inserted.createdAt })
      .where(eq(conversations.id, conversationId));

    // Delivery receipts for every other member.
    if (others.length > 0) {
      await db
        .insert(messageReceipts)
        .values(others.map((uid) => ({ messageId: inserted.id, userId: uid })))
        .onConflictDoNothing();
    }

    // Mark the conversation read for the sender.
    await markConversationRead(conversationId, me.id, inserted.id);

    const dto = await getMessageById(inserted.id, me.id);
    notifyConversation(conversationId, me.id, "message:new", { message: dto });
    publishToUsers(others, { type: "message:new", conversationId, payload: { message: dto } });

    const senderRows = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, me.id))
      .limit(1);
    const preview =
      kind === "text"
        ? text.slice(0, 120)
        : kind === "image"
          ? "📷 صورة"
          : kind === "video"
            ? "🎥 فيديو"
            : kind === "audio"
              ? "🎙️ رسالة صوتية"
              : "📄 مستند";
    void senderRows;
    void sql;
    void inArray;
    void hydrateMessages;

    await pushToConversation(
      conversationId,
      me.id,
      me.displayName,
      preview,
      `/app?chat=${conversationId}`,
      `msg-${inserted.id}`,
    );

    return NextResponse.json({ message: dto });
  } catch (error) {
    return errorResponse(error);
  }
}
