import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { blocks, conversationMembers, conversations, users } from "@/db/schema";
import { HttpError, errorResponse, requireAuthUser } from "@/lib/session";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { cleanText, directKeyFor, normalizePublicId } from "@/lib/utils";
import { findDirectConversation, listConversations } from "@/lib/chat";
import { publishToUsers } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await requireAuthUser();
    const list = await listConversations(me.id);
    return NextResponse.json({ conversations: list });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const me = await requireAuthUser();
    const limited = rateLimit(clientKey(request, "conversations", me.id), 40, 60 * 1000);
    if (!limited.ok) throw new HttpError(429, "rate_limited");

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const type = body.type === "group" ? "group" : "direct";

    if (type === "direct") {
      const publicId = normalizePublicId(String(body.publicId ?? ""));
      if (publicId.length < 6) throw new HttpError(400, "invalid_public_id");
      if (publicId === me.publicId) throw new HttpError(400, "own_id");

      const targetRows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.publicId, publicId))
        .limit(1);
      const target = targetRows[0];
      if (!target) throw new HttpError(404, "not_found");

      const blockRows = await db
        .select({ id: blocks.id })
        .from(blocks)
        .where(
          inArray(blocks.blockerId, [me.id, target.id]),
        );
      const allBlocks = await db.select().from(blocks);
      const blocked = allBlocks.some(
        (b) =>
          (b.blockerId === me.id && b.blockedId === target.id) ||
          (b.blockerId === target.id && b.blockedId === me.id),
      );
      void blockRows;
      if (blocked) throw new HttpError(403, "blocked");

      const existing = await findDirectConversation(me.id, target.id);
      if (existing) {
        const list = await listConversations(me.id);
        return NextResponse.json({
          conversation: list.find((c) => c.id === existing.id) ?? null,
          existed: true,
        });
      }

      const [created] = await db
        .insert(conversations)
        .values({
          type: "direct",
          directKey: directKeyFor(me.id, target.id),
          createdBy: me.id,
          lastMessageAt: new Date(),
        })
        .returning();

      await db.insert(conversationMembers).values([
        { conversationId: created.id, userId: me.id, role: "member" },
        { conversationId: created.id, userId: target.id, role: "member" },
      ]);

      publishToUsers([target.id], { type: "conversation:new", conversationId: created.id });
      const list = await listConversations(me.id);
      return NextResponse.json({
        conversation: list.find((c) => c.id === created.id) ?? null,
        existed: false,
      });
    }

    // Group
    const name = cleanText(body.name, 80);
    if (name.length < 2) throw new HttpError(400, "invalid_name");
    const description = cleanText(body.description, 240);
    const rawMembers = Array.isArray(body.memberIds) ? body.memberIds : [];
    const publicIds = rawMembers
      .map((v) => normalizePublicId(String(v)))
      .filter((v) => v.length >= 6 && v !== me.publicId);

    const memberRows = publicIds.length
      ? await db
          .select({ id: users.id })
          .from(users)
          .where(inArray(users.publicId, publicIds))
      : [];

    const [created] = await db
      .insert(conversations)
      .values({
        type: "group",
        name,
        description,
        createdBy: me.id,
        sendPermission: "all",
        lastMessageAt: new Date(),
      })
      .returning();

    const values = [
      { conversationId: created.id, userId: me.id, role: "admin" as const },
      ...memberRows.map((m) => ({
        conversationId: created.id,
        userId: m.id,
        role: "member" as const,
      })),
    ];
    await db.insert(conversationMembers).values(values);

    publishToUsers(
      values.map((v) => v.userId),
      { type: "conversation:new", conversationId: created.id },
    );

    const list = await listConversations(me.id);
    return NextResponse.json({
      conversation: list.find((c) => c.id === created.id) ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const me = await requireAuthUser();
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!id) throw new HttpError(400, "invalid_id");
    await db
      .delete(conversationMembers)
      .where(
        and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, me.id)),
      );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
