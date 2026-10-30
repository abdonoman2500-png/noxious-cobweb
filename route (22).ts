import { NextResponse } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/session";
import { assertMember, markConversationRead } from "@/lib/chat";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const me = await requireAuthUser();
    const { id } = await ctx.params;
    const conversationId = Number(id);
    await assertMember(conversationId, me.id);
    const body = (await request.json().catch(() => ({}))) as { messageId?: number };
    const messageId = Number(body.messageId ?? 0) || undefined;
    await markConversationRead(conversationId, me.id, messageId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
