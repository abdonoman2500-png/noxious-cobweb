import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, messages, reactions } from "@/db/schema";
import { errorResponse, HttpError, requireAuthUser } from "@/lib/session";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/utils";
import { assertMember, getMessageById, notifyConversation } from "@/lib/chat";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function loadOwnedMessage(messageId: number, userId: number) {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  const message = rows[0];
  if (!message) throw new HttpError(404, "not_found");
  await assertMember(message.conversationId, userId);
  return message;
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const me = await requireAuthUser();
    const { id } = await ctx.params;
    const messageId = Number(id);
    const message = await loadOwnedMessage(messageId, me.id);
    if (message.senderId !== me.id) throw new HttpError(403, "not_owner");
    if (message.deletedAt) throw new HttpError(400, "already_deleted");

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const text = cleanText(body.body, 4000);
    if (!text) throw new HttpError(400, "empty_message");

    await db
      .update(messages)
      .set({ body: text, editedAt: new Date() })
      .where(eq(messages.id, messageId));

    const dto = await getMessageById(messageId, me.id);
    notifyConversation(message.conversationId, me.id, "message:updated", { message: dto });
    return NextResponse.json({ message: dto });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const me = await requireAuthUser();
    const { id } = await ctx.params;
    const messageId = Number(id);
    const message = await loadOwnedMessage(messageId, me.id);
    if (message.senderId !== me.id) throw new HttpError(403, "not_owner");

    const scope = new URL(request.url).searchParams.get("scope");
    if (scope === "me") {
      // Delete for me only: hide locally by marking deleted (client-side filter).
      return NextResponse.json({ ok: true, scope: "me" });
    }

    await db
      .update(messages)
      .set({ deletedAt: new Date(), body: "", mediaId: null })
      .where(eq(messages.id, messageId));

    const dto = await getMessageById(messageId, me.id);
    notifyConversation(message.conversationId, me.id, "message:deleted", { message: dto });
    return NextResponse.json({ ok: true, message: dto });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  // Toggle a reaction on a message.
  try {
    const me = await requireAuthUser();
    const { id } = await ctx.params;
    const messageId = Number(id);
    const message = await loadOwnedMessage(messageId, me.id);

    const limited = rateLimit(clientKey(request, "react", me.id), 120, 60 * 1000);
    if (!limited.ok) throw new HttpError(429, "rate_limited");

    const body = (await request.json().catch(() => ({}))) as { emoji?: string };
    const emoji = cleanText(body.emoji, 16);
    if (!emoji) throw new HttpError(400, "invalid_emoji");

    const existing = await db
      .select({ id: reactions.id })
      .from(reactions)
      .where(
        and(
          eq(reactions.messageId, messageId),
          eq(reactions.userId, me.id),
          eq(reactions.emoji, emoji),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db.delete(reactions).where(eq(reactions.id, existing[0].id));
    } else {
      await db
        .insert(reactions)
        .values({ messageId, userId: me.id, emoji })
        .onConflictDoNothing();
    }

    const dto = await getMessageById(messageId, me.id);
    notifyConversation(message.conversationId, me.id, "message:updated", { message: dto });
    return NextResponse.json({ message: dto });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const me = await requireAuthUser();
    const { id } = await ctx.params;
    const messageId = Number(id);
    await loadOwnedMessage(messageId, me.id);
    const dto = await getMessageById(messageId, me.id);
    return NextResponse.json({ message: dto });
  } catch (error) {
    return errorResponse(error);
  }
}

void inArray;
void conversationMembers;
