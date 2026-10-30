import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { calls, conversationMembers, users } from "@/db/schema";
import { errorResponse, HttpError, requireAuthUser } from "@/lib/session";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { assertMember } from "@/lib/chat";
import { callHistory } from "@/lib/calls";
import { publishToUsers } from "@/lib/realtime";
import { pushEnabledFor, sendPushToUser } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await requireAuthUser();
    const history = await callHistory(me.id);
    return NextResponse.json({ calls: history });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const me = await requireAuthUser();
    const limited = rateLimit(clientKey(request, "call", me.id), 20, 60 * 1000);
    if (!limited.ok) throw new HttpError(429, "rate_limited");

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const conversationId = Number(body.conversationId ?? 0);
    const kind = body.kind === "video" ? "video" : "audio";
    if (!conversationId) throw new HttpError(400, "invalid_conversation");
    await assertMember(conversationId, me.id);

    // End any stale ringing calls from this user first.
    await db
      .update(calls)
      .set({ status: "missed", endedAt: new Date() })
      .where(and(eq(calls.callerId, me.id), eq(calls.status, "ringing")));

    const memberRows = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId));
    const others = memberRows.map((m) => m.userId).filter((id) => id !== me.id);
    if (others.length === 0) throw new HttpError(400, "no_recipient");

    const [created] = await db
      .insert(calls)
      .values({
        conversationId,
        callerId: me.id,
        calleeId: others.length === 1 ? others[0] : null,
        kind,
        status: "ringing",
      })
      .returning();

    publishToUsers(others, {
      type: "call:incoming",
      conversationId,
      payload: { callId: created.id, kind, callerId: me.id },
    });

    const callerRows = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, me.id))
      .limit(1);
    await Promise.all(
      others.map(async (uid) => {
        if (!(await pushEnabledFor(uid))) return;
        await sendPushToUser(uid, {
          title: `${callerRows[0]?.displayName ?? "Someone"} · ${kind === "video" ? "مكالمة فيديو" : "مكالمة صوتية"}`,
          body: "اضغط للرد على المكالمة",
          url: `/app?call=${created.id}`,
          tag: `call-${created.id}`,
        });
      }),
    );

    return NextResponse.json({ callId: created.id, kind, status: created.status });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const me = await requireAuthUser();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const callId = Number(body.callId ?? 0);
    const action = String(body.action ?? "");
    if (!callId) throw new HttpError(400, "invalid_call");

    const rows = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
    const call = rows[0];
    if (!call) throw new HttpError(404, "not_found");
    const isParticipant = call.callerId === me.id || call.calleeId === me.id;
    if (!isParticipant) throw new HttpError(403, "not_participant");

    const peerIds = [call.callerId, call.calleeId].filter((v): v is number => Boolean(v));
    const otherIds = peerIds.filter((id) => id !== me.id);

    if (action === "accept") {
      await db
        .update(calls)
        .set({ status: "accepted", answeredAt: new Date() })
        .where(eq(calls.id, callId));
      publishToUsers(otherIds, { type: "call:accepted", conversationId: call.conversationId });
      return NextResponse.json({ ok: true, status: "accepted" });
    }

    if (action === "reject") {
      await db
        .update(calls)
        .set({ status: "rejected", endedAt: new Date() })
        .where(eq(calls.id, callId));
      publishToUsers(otherIds, { type: "call:rejected", conversationId: call.conversationId });
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    if (action === "end") {
      const duration = call.answeredAt
        ? Math.max(0, Math.round((Date.now() - new Date(call.answeredAt).getTime()) / 1000))
        : 0;
      const status = call.status === "ringing" ? "missed" : "ended";
      await db
        .update(calls)
        .set({ status, endedAt: new Date(), durationSeconds: duration })
        .where(eq(calls.id, callId));
      publishToUsers(otherIds, {
        type: "call:ended",
        conversationId: call.conversationId,
        payload: { durationSeconds: duration },
      });
      return NextResponse.json({ ok: true, status, durationSeconds: duration });
    }

    throw new HttpError(400, "invalid_action");
  } catch (error) {
    return errorResponse(error);
  }
}


