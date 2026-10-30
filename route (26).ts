import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { blocks, users } from "@/db/schema";
import { requireAuthUser } from "@/lib/session";
import { normalizePublicId } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const me = await requireAuthUser();
    const raw = new URL(request.url).searchParams.get("publicId") ?? "";
    const publicId = normalizePublicId(raw);
    if (publicId.length < 6) {
      return NextResponse.json({ error: "invalid_public_id" }, { status: 400 });
    }
    if (publicId === me.publicId) {
      return NextResponse.json({ error: "own_id" }, { status: 400 });
    }

    const rows = await db
      .select({
        id: users.id,
        publicId: users.publicId,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        about: users.about,
        profileVisibility: users.profileVisibility,
        lastSeenAt: users.lastSeenAt,
      })
      .from(users)
      .where(eq(users.publicId, publicId))
      .limit(1);

    const user = rows[0];
    if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const [iBlocked, blockedMe] = await Promise.all([
      db
        .select({ id: blocks.id })
        .from(blocks)
        .where(eq(blocks.blockerId, me.id))
        .then((r) => r.length > 0),
      db
        .select({ id: blocks.id })
        .from(blocks)
        .where(eq(blocks.blockedId, me.id))
        .then((r) => r.length > 0),
    ]);
    void blockedMe;

    const blockedRows = await db.select().from(blocks).where(eq(blocks.blockerId, user.id));
    const blocksMe = blockedRows.some((b) => b.blockedId === me.id);

    return NextResponse.json({
      user: {
        id: user.id,
        publicId: user.publicId,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        about: user.profileVisibility === "nobody" ? "" : user.about,
        online: Date.now() - new Date(user.lastSeenAt).getTime() < 60_000,
        lastSeenAt: user.lastSeenAt,
      },
      canMessage: !iBlocked && !blocksMe,
      blocked: iBlocked,
    });
  } catch (error) {
    const status = (error as { status?: number }).status;
    return NextResponse.json({ error: status ? "unauthorized" : "server_error" }, { status: status ?? 500 });
  }
}
