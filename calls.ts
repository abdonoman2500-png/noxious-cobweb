import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { calls, users } from "@/db/schema";
import type { CallDTO } from "@/lib/types";

export async function activeCallsFor(userId: number): Promise<CallDTO[]> {
  const rows = await db
    .select({
      call: calls,
      callerName: users.displayName,
    })
    .from(calls)
    .innerJoin(users, eq(users.id, calls.callerId))
    .where(
      and(
        or(eq(calls.callerId, userId), eq(calls.calleeId, userId)),
        inArray(calls.status, ["ringing", "accepted"]),
      ),
    )
    .orderBy(desc(calls.startedAt))
    .limit(5);

  const peerIds = rows
    .map((r) => (r.call.callerId === userId ? r.call.calleeId : r.call.callerId))
    .filter((v): v is number => Boolean(v));
  const peerRows = peerIds.length
    ? await db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, peerIds))
    : [];
  const peerMap = new Map(peerRows.map((p) => [p.id, p.displayName]));

  return rows.map(({ call, callerName }) => ({
    id: call.id,
    conversationId: call.conversationId,
    callerId: call.callerId,
    callerName,
    calleeId: call.calleeId,
    kind: call.kind as "audio" | "video",
    status: call.status as CallDTO["status"],
    direction: call.callerId === userId ? "outgoing" : "incoming",
    peerName:
      call.callerId === userId
        ? (call.calleeId ? peerMap.get(call.calleeId) : "Group") ?? "Group"
        : callerName,
    startedAt: call.startedAt.toISOString(),
    answeredAt: call.answeredAt ? call.answeredAt.toISOString() : null,
    durationSeconds: call.durationSeconds,
  }));
}

export async function callHistory(userId: number, limit = 30): Promise<CallDTO[]> {
  const rows = await db
    .select({ call: calls, callerName: users.displayName })
    .from(calls)
    .innerJoin(users, eq(users.id, calls.callerId))
    .where(or(eq(calls.callerId, userId), eq(calls.calleeId, userId)))
    .orderBy(desc(calls.startedAt))
    .limit(limit);

  const peerIds = rows
    .map((r) => (r.call.callerId === userId ? r.call.calleeId : r.call.callerId))
    .filter((v): v is number => Boolean(v));
  const peerRows = peerIds.length
    ? await db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, peerIds))
    : [];
  const peerMap = new Map(peerRows.map((p) => [p.id, p.displayName]));

  return rows.map(({ call, callerName }) => ({
    id: call.id,
    conversationId: call.conversationId,
    callerId: call.callerId,
    callerName,
    calleeId: call.calleeId,
    kind: call.kind as "audio" | "video",
    status: call.status as CallDTO["status"],
    direction: call.callerId === userId ? "outgoing" : "incoming",
    peerName:
      call.callerId === userId
        ? (call.calleeId ? peerMap.get(call.calleeId) : "Group") ?? "Group"
        : callerName,
    startedAt: call.startedAt.toISOString(),
    answeredAt: call.answeredAt ? call.answeredAt.toISOString() : null,
    durationSeconds: call.durationSeconds,
  }));
}
