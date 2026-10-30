import { NextResponse } from "next/server";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, typingStates, users } from "@/db/schema";
import { errorResponse, requireAuthUser } from "@/lib/session";
import { activeCallsFor } from "@/lib/calls";
import type { PulseDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Cheap polling endpoint. The client compares the returned signature with the
 * previous one and only refetches the full bootstrap when something changed.
 * This is the safety net behind the SSE stream.
 */
export async function GET() {
  try {
    const me = await requireAuthUser();

    const memberRows = await db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, me.id));
    const ids = memberRows.map((r) => r.conversationId);

    const [convRows, typingRows, callRows] = await Promise.all([
      ids.length
        ? db.execute(sql`
            select cm.conversation_id as conversation_id,
                   coalesce(max(m.id), 0)::int as last_message_id,
                   coalesce(max(m.created_at), now()) as last_message_at,
                   count(m.id)::int as unread_count
            from conversation_members cm
            left join messages m
              on m.conversation_id = cm.conversation_id
              and m.sender_id <> cm.user_id
              and m.deleted_at is null
              and m.created_at > cm.last_read_at
            where cm.user_id = ${me.id}
            group by cm.conversation_id
          `)
        : Promise.resolve({ rows: [] }),
      ids.length
        ? db
            .select({
              conversationId: typingStates.conversationId,
              userId: typingStates.userId,
              displayName: users.displayName,
            })
            .from(typingStates)
            .innerJoin(users, eq(users.id, typingStates.userId))
            .where(
              and(
                inArray(typingStates.conversationId, ids),
                gt(typingStates.updatedAt, new Date(Date.now() - 6000)),
              ),
            )
        : Promise.resolve([]),
      activeCallsFor(me.id),
    ]);

    const payload: PulseDTO = {
      serverTime: new Date().toISOString(),
      conversations: (
        convRows.rows as unknown as {
          conversation_id: number;
          last_message_id: number;
          last_message_at: string;
          unread_count: number;
        }[]
      ).map((r) => ({
        id: r.conversation_id,
        lastMessageId: Number(r.last_message_id),
        lastMessageAt: new Date(r.last_message_at).toISOString(),
        unreadCount: Number(r.unread_count),
      })),
      typing: typingRows
        .filter((t) => t.userId !== me.id)
        .map((t) => ({
          conversationId: t.conversationId,
          userId: t.userId,
          displayName: t.displayName,
        })),
      calls: callRows,
      statuses: [],
    };

    return NextResponse.json(payload);
  } catch (error) {
    return errorResponse(error);
  }
}
