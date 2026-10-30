import { NextResponse } from "next/server";
import { and, eq, gt, ne } from "drizzle-orm";
import { db } from "@/db";
import { callSignals, calls } from "@/db/schema";
import { errorResponse, HttpError, requireAuthUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const me = await requireAuthUser();
    const { id } = await ctx.params;
    const callId = Number(id);
    const since = Number(new URL(request.url).searchParams.get("since") ?? 0) || 0;

    const rows = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
    const call = rows[0];
    if (!call) throw new HttpError(404, "not_found");
    if (call.callerId !== me.id && call.calleeId !== me.id) throw new HttpError(403, "forbidden");

    const signals = await db
      .select()
      .from(callSignals)
      .where(
        and(eq(callSignals.callId, callId), gt(callSignals.id, since), ne(callSignals.fromUserId, me.id)),
      )
      .orderBy(callSignals.id);

    return NextResponse.json({
      status: call.status,
      answeredAt: call.answeredAt ? call.answeredAt.toISOString() : null,
      signals: signals.map((s) => ({ id: s.id, kind: s.kind, payload: s.payload })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const me = await requireAuthUser();
    const { id } = await ctx.params;
    const callId = Number(id);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const kind = ["offer", "answer", "candidate"].includes(String(body.kind))
      ? String(body.kind)
      : null;
    if (!kind) throw new HttpError(400, "invalid_signal");

    const rows = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
    const call = rows[0];
    if (!call) throw new HttpError(404, "not_found");
    if (call.callerId !== me.id && call.calleeId !== me.id) throw new HttpError(403, "forbidden");

    const [signal] = await db
      .insert(callSignals)
      .values({ callId, fromUserId: me.id, kind, payload: body.payload ?? {} })
      .returning();

    return NextResponse.json({ ok: true, id: signal.id });
  } catch (error) {
    return errorResponse(error);
  }
}
