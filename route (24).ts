import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, conversations } from "@/db/schema";
import { errorResponse, requireAuthUser } from "@/lib/session";
import { cleanText } from "@/lib/utils";
import { assertMember, getConversationDTO, notifyConversation } from "@/lib/chat";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const me = await requireAuthUser();
    const { id } = await ctx.params;
    const dto = await getConversationDTO(Number(id), me.id);
    return NextResponse.json({ conversation: dto });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const me = await requireAuthUser();
    const { id } = await ctx.params;
    const conversationId = Number(id);
    const membership = await assertMember(conversationId, me.id);
    if (membership.role !== "admin") {
      return NextResponse.json({ error: "admin_only" }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string") {
      const name = cleanText(body.name, 80);
      if (name.length < 2) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
      patch.name = name;
    }
    if (typeof body.description === "string") patch.description = cleanText(body.description, 240);
    if (body.sendPermission === "all" || body.sendPermission === "admins") {
      patch.sendPermission = body.sendPermission;
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "nothing_to_update" });
    await db.update(conversations).set(patch).where(eq(conversations.id, conversationId));
    notifyConversation(conversationId, me.id, "conversation:updated");
    const dto = await getConversationDTO(conversationId, me.id);
    return NextResponse.json({ conversation: dto });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const me = await requireAuthUser();
    const { id } = await ctx.params;
    const conversationId = Number(id);
    await assertMember(conversationId, me.id);
    await db
      .delete(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, me.id),
        ),
      );
    notifyConversation(conversationId, me.id, "conversation:updated");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
