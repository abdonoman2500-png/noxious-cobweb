import { NextResponse } from "next/server";
import { and, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blocks, conversationMembers, statusViews, statuses, users } from "@/db/schema";
import { errorResponse, requireAuthUser } from "@/lib/session";
import { listConversations } from "@/lib/chat";
import { activeCallsFor } from "@/lib/calls";
import { getPublicKey } from "@/lib/push";
import { iceServers } from "@/lib/webrtc";
import type { BootstrapDTO, StatusDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await requireAuthUser();

    const [conversations, blockedRows, statusRows, calls, vapid] = await Promise.all([
      listConversations(me.id),
      db
        .select({
          id: users.id,
          publicId: users.publicId,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          about: users.about,
          lastSeenAt: users.lastSeenAt,
        })
        .from(blocks)
        .innerJoin(users, eq(users.id, blocks.blockedId))
        .where(eq(blocks.blockerId, me.id)),
      db
        .select({
          status: statuses,
          userName: users.displayName,
          userAvatar: users.avatarUrl,
          userPublicId: users.publicId,
        })
        .from(statuses)
        .innerJoin(users, eq(users.id, statuses.userId))
        .where(
          and(
            gt(statuses.expiresAt, new Date()),
            or(
              eq(statuses.userId, me.id),
              eq(statuses.audience, "everyone"),
              and(
                eq(statuses.audience, "contacts"),
                sql`exists (
                  select 1 from conversation_members cm
                  where cm.user_id = ${me.id}
                    and exists (
                      select 1 from conversation_members cm2
                      where cm2.conversation_id = cm.conversation_id
                        and cm2.user_id = ${statuses.userId}
                    )
                )`,
              ),
            ),
          ),
        )
        .orderBy(desc(statuses.createdAt)),
      activeCallsFor(me.id),
      getPublicKey(),
    ]);

    const statusIds = statusRows.map((r) => r.status.id);
    const viewRows = statusIds.length
      ? await db
          .select({ statusId: statusViews.statusId, viewerId: statusViews.viewerId })
          .from(statusViews)
          .where(inArray(statusViews.statusId, statusIds))
      : [];
    const myStatusIds = new Set(statusRows.filter((r) => r.status.userId === me.id).map((r) => r.status.id));

    const statusDTOs: StatusDTO[] = statusRows.map(({ status, userName, userAvatar, userPublicId }) => {
      const views = viewRows.filter((v) => v.statusId === status.id);
      return {
        id: status.id,
        userId: status.userId,
        userName,
        userAvatar,
        userPublicId,
        kind: status.kind as StatusDTO["kind"],
        body: status.body,
        mediaUrl: status.mediaId ? `/api/media/${status.mediaId}` : null,
        background: status.background,
        audience: status.audience as StatusDTO["audience"],
        createdAt: status.createdAt.toISOString(),
        expiresAt: status.expiresAt.toISOString(),
        viewed: myStatusIds.has(status.id)
          ? true
          : views.some((v) => v.viewerId === me.id),
        viewCount: myStatusIds.has(status.id) ? views.length : 0,
        mine: status.userId === me.id,
      };
    });

    const incoming = calls.find((c) => c.status === "ringing" && c.direction === "incoming") ?? null;
    const active = calls.find((c) => c.status === "accepted") ?? null;

    const payload: BootstrapDTO = {
      me: {
        id: me.id,
        publicId: me.publicId,
        email: me.email,
        displayName: me.displayName,
        about: me.about,
        avatarUrl: me.avatarUrl,
        locale: me.locale === "en" ? "en" : "ar",
        theme: me.theme === "dark" ? "dark" : "light",
        wallpaper: me.wallpaper,
        lastSeenVisibility: me.lastSeenVisibility,
        profileVisibility: me.profileVisibility,
        readReceipts: me.readReceipts,
        pushEnabled: me.pushEnabled,
      },
      conversations,
      statuses: statusDTOs,
      blocked: blockedRows.map((b) => ({
        id: b.id,
        publicId: b.publicId,
        displayName: b.displayName,
        avatarUrl: b.avatarUrl,
        about: b.about,
        online: Date.now() - new Date(b.lastSeenAt).getTime() < 60_000,
        lastSeenAt: new Date(b.lastSeenAt).toISOString(),
      })),
      activeCall: active,
      incomingCall: incoming,
      vapidPublicKey: vapid,
      iceServers,
      serverTime: new Date().toISOString(),
    };

    void conversationMembers;
    return NextResponse.json(payload);
  } catch (error) {
    return errorResponse(error);
  }
}
