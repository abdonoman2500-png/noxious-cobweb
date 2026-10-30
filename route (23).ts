import { NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { typingStates, users } from "@/db/schema";
import { errorResponse, requireAuthUser } from "@/lib/session";
import { assertMember, notifyConversation } from "@/lib/chat";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const me = await requireAuthUser();
    const { id } = await ctx.params;
    const conversationId = Number(id);
    await assertMember(conversationId, me.id);

    const body = (await request.json().catch(() => ({}))) as { typing?: boolean };
    if (body.typing === false) {
      await db
        .delete(typingStates)
        .where(
          and(
            eq(typingStates.conversationId, conversationId),
            eq(typingStates.userId, me.id),
          ),
        );
      return NextResponse.json({ ok: true });
    }

    await db
      .insert(typingStates)
      .values({ conversationId, userId: me.id, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [typingStates.conversationId, typingStates.userId],
        set: { updatedAt: new Date() },
      });

    notifyConversation(conversationId, me.id, "typing", { userId: me.id, typing: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const me = await requireAuthUser();
    const { id } = await ctx.params;
    const conversationId = Number(id);
    await assertMember(conversationId, me.id);
    const rows = await db
      .select({ userId: typingStates.userId, displayName: users.displayName })
      .from(typingStates)
      .innerJoin(users, eq(users.id, typingStates.userId))
      .where(
        and(
          eq(typingStates.conversationId, conversationId),
          gt(typingStates.updatedAt, new Date(Date.now() - 6000)),
        ),
      );
    return NextResponse.json({
      typing: rows.filter((r) => r.userId !== me.id).map((r) => r.displayName),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
