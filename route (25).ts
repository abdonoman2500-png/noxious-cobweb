import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, users } from "@/db/schema";
import { errorResponse, HttpError, requireAuthUser } from "@/lib/session";
import { normalizePublicId } from "@/lib/utils";
import { assertMember, notifyConversation } from "@/lib/chat";
import { publishToUsers } from "@/lib/realtime";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const me = await requireAuthUser();
    const { id } = await ctx.params;
    const conversationId = Number(id);
    const membership = await assertMember(conversationId, me.id);
    if (membership.role !== "admin") throw new HttpError(403, "admin_only");

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const publicId = normalizePublicId(String(body.publicId ?? ""));
    if (publicId.length < 6) throw new HttpError(400, "invalid_public_id");

    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.publicId, publicId))
      .limit(1);
    if (!rows[0]) throw new HttpError(404, "not_found");

    await db
      .insert(conversationMembers)
      .values({ conversationId, userId: rows[0].id, role: "member" })
      .onConflictDoNothing();

    publishToUsers([rows[0].id], { type: "conversation:new", conversationId });
    notifyConversation(conversationId, me.id, "conversation:updated");
    return NextResponse.json({ ok: true });
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
    if (membership.role !== "admin") throw new HttpError(403, "admin_only");

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const userId = Number(body.userId ?? 0);
    const role = body.role === "admin" ? "admin" : "member";
    if (!userId) throw new HttpError(400, "invalid_user");
    await db
      .update(conversationMembers)
      .set({ role })
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, userId),
        ),
      );
    notifyConversation(conversationId, me.id, "conversation:updated");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const me = await requireAuthUser();
    const { id } = await ctx.params;
    const conversationId = Number(id);
    const membership = await assertMember(conversationId, me.id);
    const userId = Number(new URL(request.url).searchParams.get("userId") ?? me.id);
    if (membership.role !== "admin" && userId !== me.id) throw new HttpError(403, "admin_only");

    await db
      .delete(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, userId),
        ),
      );
    publishToUsers([userId], { type: "conversation:removed", conversationId });
    notifyConversation(conversationId, me.id, "conversation:updated");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
