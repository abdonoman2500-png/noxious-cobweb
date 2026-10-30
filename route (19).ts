import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { errorResponse, HttpError, requireAuthUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const me = await requireAuthUser();
    const body = (await request.json().catch(() => ({}))) as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      throw new HttpError(400, "invalid_subscription");
    }
    await db
      .insert(pushSubscriptions)
      .values({
        userId: me.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: (request.headers.get("user-agent") ?? "").slice(0, 300),
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: me.id,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          failureCount: 0,
        },
      });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const me = await requireAuthUser();
    const endpoint = new URL(request.url).searchParams.get("endpoint");
    if (!endpoint) throw new HttpError(400, "invalid_endpoint");
    await db
      .delete(pushSubscriptions)
      .where(
        and(eq(pushSubscriptions.userId, me.id), eq(pushSubscriptions.endpoint, endpoint)),
      );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
