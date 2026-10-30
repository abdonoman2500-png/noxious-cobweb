import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { statusViews, statuses } from "@/db/schema";
import { errorResponse, requireAuthUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  try {
    const me = await requireAuthUser();
    const { id } = await ctx.params;
    const statusId = Number(id);
    const rows = await db
      .select({ userId: statuses.userId })
      .from(statuses)
      .where(eq(statuses.id, statusId))
      .limit(1);
    if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (rows[0].userId !== me.id) {
      await db
        .insert(statusViews)
        .values({ statusId, viewerId: me.id })
        .onConflictDoNothing();
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const me = await requireAuthUser();
    const { id } = await ctx.params;
    const statusId = Number(id);
    const rows = await db
      .select({ id: statusViews.id })
      .from(statusViews)
      .where(and(eq(statusViews.statusId, statusId), eq(statusViews.viewerId, me.id)))
      .limit(1);
    return NextResponse.json({ viewed: rows.length > 0 });
  } catch (error) {
    return errorResponse(error);
  }
}
