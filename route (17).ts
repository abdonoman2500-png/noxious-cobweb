import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { media } from "@/db/schema";
import { errorResponse, requireAuthUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await requireAuthUser();
    const rows = await db
      .select({
        kind: media.kind,
        count: sql<number>`count(*)::int`,
        bytes: sql<number>`coalesce(sum(${media.sizeBytes}), 0)::int`,
      })
      .from(media)
      .where(eq(media.ownerId, me.id))
      .groupBy(media.kind);

    const totalBytes = rows.reduce((sum, row) => sum + Number(row.bytes), 0);
    const totalCount = rows.reduce((sum, row) => sum + Number(row.count), 0);
    return NextResponse.json({
      totalBytes,
      totalCount,
      byKind: rows.map((row) => ({
        kind: row.kind,
        count: Number(row.count),
        bytes: Number(row.bytes),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
