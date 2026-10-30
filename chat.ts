import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  blocks,
  conversationMembers,
  conversations,
  media,
  messageReceipts,
  messages,
  reactions,
  users,
} from "@/db/schema";
import { HttpError } from "@/lib/session";
import { publishToUsers } from "@/lib/realtime";
import { pushEnabledFor, sendPushToUser } from "@/lib/push";
import type { ConversationDTO, MessageDTO, PublicUser } from "@/lib/types";
import { directKeyFor } from "@/lib/utils";

export type MessageRow = {
  id: number;
  conversationId: number;
  senderId: number;
  kind: string;
  body: string;
  mediaId: string | null;
  replyToId: number | null;
  forwardedFromId: number | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  senderName: string;
  senderPublicId: string;
  senderAvatar: string | null;
};

const messageSelection = {
  id: messages.id,
  conversationId: messages.conversationId,
  senderId: messages.senderId,
  kind: messages.kind,
  body: messages.body,
  mediaId: messages.mediaId,
  replyToId: messages.replyToId,
  forwardedFromId: messages.forwardedFromId,
  editedAt: messages.editedAt,
  deletedAt: messages.deletedAt,
  createdAt: messages.createdAt,
  senderName: users.displayName,
  senderPublicId: users.publicId,
  senderAvatar: users.avatarUrl,
};

export async function assertMember(conversationId: number, userId: number) {
  const rows = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new HttpError(403, "not_a_member");
  return rows[0];
}

export async function conversationMemberIds(conversationId: number): Promise<number[]> {
  const rows = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));
  return rows.map((r) => r.userId);
}

export async function hasBlockBetween(a: number, b: number): Promise<boolean> {
  const rows = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      sql`(${blocks.blockerId} = ${a} and ${blocks.blockedId} = ${b}) or (${blocks.blockerId} = ${b} and ${blocks.blockedId} = ${a})`,
    )
    .limit(1);
  return rows.length > 0;
}

export async function findDirectConversation(a: number, b: number) {
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.directKey, directKeyFor(a, b)))
    .limit(1);
  return rows[0] ?? null;
}

export async function hydrateMessages(rows: MessageRow[], viewerId: number): Promise<MessageDTO[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const mediaIds = rows.map((r) => r.mediaId).filter((v): v is string => Boolean(v));
  const replyIds = rows.map((r) => r.replyToId).filter((v): v is number => Boolean(v));
  const forwardedIds = rows
    .map((r) => r.forwardedFromId)
    .filter((v): v is number => Boolean(v));

  const [reactionRows, receiptRows, mediaRows, replyRows, forwardedRows] = await Promise.all([
    db
      .select({ messageId: reactions.messageId, emoji: reactions.emoji, userId: reactions.userId })
      .from(reactions)
      .where(inArray(reactions.messageId, ids)),
    db
      .select({
        messageId: messageReceipts.messageId,
        delivered: sql<number>`count(*)::int`,
        read: sql<number>`count(${messageReceipts.readAt})::int`,
      })
      .from(messageReceipts)
      .where(inArray(messageReceipts.messageId, ids))
      .groupBy(messageReceipts.messageId),
    mediaIds.length
      ? db
          .select({
            id: media.id,
            mimeType: media.mimeType,
            fileName: media.fileName,
            sizeBytes: media.sizeBytes,
          })
          .from(media)
          .where(inArray(media.id, mediaIds))
      : Promise.resolve([]),
    replyIds.length
      ? db
          .select({
            id: messages.id,
            senderId: messages.senderId,
            kind: messages.kind,
            body: messages.body,
            deletedAt: messages.deletedAt,
            senderName: users.displayName,
          })
          .from(messages)
          .innerJoin(users, eq(users.id, messages.senderId))
          .where(inArray(messages.id, replyIds))
      : Promise.resolve([]),
    forwardedIds.length
      ? db
          .select({ id: messages.id, senderName: users.displayName })
          .from(messages)
          .innerJoin(users, eq(users.id, messages.senderId))
          .where(inArray(messages.id, forwardedIds))
      : Promise.resolve([]),
  ]);

  const forwardedMap = new Map(forwardedRows.map((row) => [row.id, row.senderName]));
  const mediaMap = new Map(mediaRows.map((m) => [m.id, m]));
  const replyMap = new Map(replyRows.map((m) => [m.id, m]));
  const receiptMap = new Map(receiptRows.map((r) => [r.messageId, r]));

  return rows.map((row) => {
    const reactionMap = new Map<string, { emoji: string; count: number; mine: boolean }>();
    for (const r of reactionRows) {
      if (r.messageId !== row.id) continue;
      const entry = reactionMap.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
      entry.count += 1;
      if (r.userId === viewerId) entry.mine = true;
      reactionMap.set(r.emoji, entry);
    }
    const mediaRow = row.mediaId ? mediaMap.get(row.mediaId) : undefined;
    const reply = row.replyToId ? replyMap.get(row.replyToId) : undefined;
    const receipt = receiptMap.get(row.id);
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      senderName: row.senderName,
      senderPublicId: row.senderPublicId,
      senderAvatar: row.senderAvatar,
      kind: row.kind as MessageDTO["kind"],
      body: row.body,
      mediaId: row.mediaId,
      mediaUrl: row.mediaId ? `/api/media/${row.mediaId}` : null,
      mediaName: mediaRow?.fileName ?? null,
      mediaMime: mediaRow?.mimeType ?? null,
      mediaSize: mediaRow?.sizeBytes ?? null,
      replyTo: reply
        ? {
            id: reply.id,
            senderName: reply.senderName,
            body: reply.deletedAt ? "" : reply.body,
            kind: reply.kind,
          }
        : null,
      forwardedFrom: row.forwardedFromId
        ? (forwardedMap.get(row.forwardedFromId) ?? "Forwarded")
        : null,
      reactions: [...reactionMap.values()],
      deliveredCount: receipt?.delivered ?? 0,
      readCount: receipt?.read ?? 0,
      editedAt: row.editedAt ? row.editedAt.toISOString() : null,
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    } satisfies MessageDTO;
  });
}

export async function listMessages(
  conversationId: number,
  viewerId: number,
  options: { before?: number; limit?: number } = {},
): Promise<MessageDTO[]> {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const where = options.before
    ? and(eq(messages.conversationId, conversationId), lt(messages.id, options.before))
    : eq(messages.conversationId, conversationId);

  const rows = await db
    .select(messageSelection)
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(where)
    .orderBy(desc(messages.id))
    .limit(limit);

  return hydrateMessages(rows.reverse(), viewerId);
}

export async function getMessageById(id: number, viewerId: number): Promise<MessageDTO | null> {
  const rows = await db
    .select(messageSelection)
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(eq(messages.id, id))
    .limit(1);
  if (!rows[0]) return null;
  const [dto] = await hydrateMessages(rows, viewerId);
  return dto ?? null;
}

export async function markConversationRead(conversationId: number, userId: number, upToId?: number) {
  const condition = upToId
    ? and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      )
    : and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      );
  await db
    .update(conversationMembers)
    .set({ lastReadAt: new Date() })
    .where(condition);

  if (upToId) {
    await db
      .update(messageReceipts)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(messageReceipts.messageId, upToId),
          sql`${messageReceipts.userId} <> ${userId}`,
          sql`${messageReceipts.readAt} is null`,
        ),
      );
    const others = await conversationMemberIds(conversationId);
    publishToUsers(
      others.filter((id) => id !== userId),
      { type: "read", conversationId, payload: { messageId: upToId, userId } },
    );
  }
}

export async function listConversations(userId: number): Promise<ConversationDTO[]> {
  const memberships = await db
    .select({
      conversationId: conversationMembers.conversationId,
      role: conversationMembers.role,
      muted: conversationMembers.muted,
      lastReadAt: conversationMembers.lastReadAt,
    })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));

  if (memberships.length === 0) return [];
  const ids = memberships.map((m) => m.conversationId);
  const membershipMap = new Map(memberships.map((m) => [m.conversationId, m]));

  const [convRows, memberRows, blockRows, blockedMeRows] = await Promise.all([
    db.select().from(conversations).where(inArray(conversations.id, ids)),
    db
      .select({
        conversationId: conversationMembers.conversationId,
        userId: conversationMembers.userId,
        role: conversationMembers.role,
        displayName: users.displayName,
        publicId: users.publicId,
        avatarUrl: users.avatarUrl,
        lastSeenAt: users.lastSeenAt,
      })
      .from(conversationMembers)
      .innerJoin(users, eq(users.id, conversationMembers.userId))
      .where(inArray(conversationMembers.conversationId, ids)),
    db.select().from(blocks).where(eq(blocks.blockerId, userId)),
    db.select().from(blocks).where(eq(blocks.blockedId, userId)),
  ]);

  const blockedIds = new Set(blockRows.map((b) => b.blockedId));
  const blockedMeIds = new Set(blockedMeRows.map((b) => b.blockerId));

  const idsSql = sql.join(ids.map((id) => sql`${id}`), sql`, `);
  const lastRes = await db.execute(sql`
    select distinct on (m.conversation_id)
      m.id as id, m.conversation_id as conversation_id, m.sender_id as sender_id, m.kind as kind,
      m.body as body, m.media_id as media_id, m.deleted_at as deleted_at, m.created_at as created_at
    from messages m
    where m.conversation_id in (${idsSql})
    order by m.conversation_id, m.id desc
  `);
  const unreadRes = await db.execute(sql`
    select cm.conversation_id as conversation_id, count(m.id)::int as unread
    from conversation_members cm
    left join messages m
      on m.conversation_id = cm.conversation_id
      and m.sender_id <> cm.user_id
      and m.deleted_at is null
      and m.created_at > cm.last_read_at
    where cm.user_id = ${userId} and cm.conversation_id in (${idsSql})
    group by cm.conversation_id
  `);

  type LastRow = {
    id: number;
    conversation_id: number;
    sender_id: number;
    kind: string;
    body: string;
    media_id: string | null;
    deleted_at: Date | null;
    created_at: Date;
  };
  type UnreadRow = { conversation_id: number; unread: number };

  const lastMap = new Map<number, LastRow>(
    (lastRes.rows as unknown as LastRow[]).map((r) => [r.conversation_id, r]),
  );
  const unreadMap = new Map<number, number>(
    (unreadRes.rows as unknown as UnreadRow[]).map((r) => [r.conversation_id, Number(r.unread)]),
  );
  const senderIds = [...new Set([...lastMap.values()].map((r) => r.sender_id))];
  const senderRows = senderIds.length
    ? await db
        .select({
          id: users.id,
          displayName: users.displayName,
          publicId: users.publicId,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(inArray(users.id, senderIds))
    : [];
  const senderMap = new Map(senderRows.map((s) => [s.id, s]));

  const result: ConversationDTO[] = [];
  for (const conv of convRows) {
    const membership = membershipMap.get(conv.id);
    if (!membership) continue;
    const members = memberRows.filter((m) => m.conversationId === conv.id);
    const peerRow = conv.type === "direct" ? members.find((m) => m.userId !== userId) : undefined;
    const last = lastMap.get(conv.id);
    const sender = last ? senderMap.get(last.sender_id) : undefined;
    const lastMessage: MessageDTO | null = last
      ? {
          id: last.id,
          conversationId: last.conversation_id,
          senderId: last.sender_id,
          senderName: sender?.displayName ?? "",
          senderPublicId: sender?.publicId ?? "",
          senderAvatar: sender?.avatarUrl ?? null,
          kind: last.kind as MessageDTO["kind"],
          body: last.body,
          mediaId: last.media_id,
          mediaUrl: last.media_id ? `/api/media/${last.media_id}` : null,
          mediaName: null,
          mediaMime: null,
          mediaSize: null,
          replyTo: null,
          forwardedFrom: null,
          reactions: [],
          deliveredCount: 0,
          readCount: 0,
          editedAt: null,
          deletedAt: last.deleted_at ? new Date(last.deleted_at).toISOString() : null,
          createdAt: new Date(last.created_at).toISOString(),
        }
      : null;

    result.push({
      id: conv.id,
      type: conv.type as "direct" | "group",
      name: conv.type === "group" ? conv.name ?? "Group" : peerRow?.displayName ?? "Unknown",
      avatarUrl: conv.type === "group" ? conv.avatarUrl : peerRow?.avatarUrl ?? null,
      description: conv.description,
      peer: peerRow
        ? {
            id: peerRow.userId,
            publicId: peerRow.publicId,
            displayName: peerRow.displayName,
            avatarUrl: peerRow.avatarUrl,
            about: "",
            online: Date.now() - new Date(peerRow.lastSeenAt).getTime() < 60_000,
            lastSeenAt: new Date(peerRow.lastSeenAt).toISOString(),
          }
        : null,
      members: members.map((m) => ({
        id: m.userId,
        publicId: m.publicId,
        displayName: m.displayName,
        avatarUrl: m.avatarUrl,
        role: m.role as "member" | "admin",
        online: Date.now() - new Date(m.lastSeenAt).getTime() < 60_000,
      })),
      memberCount: members.length,
      lastMessage,
      unreadCount: unreadMap.get(conv.id) ?? 0,
      lastMessageAt: last
        ? new Date(last.created_at).toISOString()
        : new Date(conv.lastMessageAt).toISOString(),
      muted: membership.muted,
      role: membership.role as "member" | "admin",
      sendPermission: conv.sendPermission as "all" | "admins",
      blocked: peerRow ? blockedIds.has(peerRow.userId) : false,
      iBlocked: peerRow ? blockedMeIds.has(peerRow.userId) : false,
    });
  }

  return result.sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
}

export async function getConversationDTO(
  conversationId: number,
  userId: number,
): Promise<ConversationDTO> {
  const all = await listConversations(userId);
  const found = all.find((c) => c.id === conversationId);
  if (!found) throw new HttpError(404, "conversation_not_found");
  return found;
}

export async function notifyConversation(
  conversationId: number,
  excludeUserId: number,
  type: string,
  payload?: unknown,
) {
  const ids = await conversationMemberIds(conversationId);
  publishToUsers(
    ids.filter((id) => id !== excludeUserId),
    { type, conversationId, payload },
  );
}

export async function pushToConversation(
  conversationId: number,
  excludeUserId: number,
  title: string,
  body: string,
  url: string,
  tag?: string,
) {
  const rows = await db
    .select({ userId: conversationMembers.userId, muted: conversationMembers.muted })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));
  await Promise.all(
    rows
      .filter((r) => r.userId !== excludeUserId && !r.muted)
      .map(async (r) => {
        if (!(await pushEnabledFor(r.userId))) return;
        await sendPushToUser(r.userId, { title, body, url, tag, conversationId });
      }),
  );
}

export async function publicUserById(id: number): Promise<PublicUser | null> {
  const rows = await db
    .select({
      id: users.id,
      publicId: users.publicId,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      about: users.about,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    publicId: row.publicId,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    about: row.about,
    online: Date.now() - new Date(row.lastSeenAt).getTime() < 60_000,
    lastSeenAt: new Date(row.lastSeenAt).toISOString(),
  };
}

export async function touchTyping(conversationId: number, userId: number) {
  await db
    .insert(typingStatesTable)
    .values({ conversationId, userId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [typingStatesTable.conversationId, typingStatesTable.userId],
      set: { updatedAt: new Date() },
    });
}

// imported lazily to keep the import list above tidy
import { typingStates as typingStatesTable } from "@/db/schema";

export async function activeTyping(conversationId: number, userId: number) {
  const rows = await db
    .select({ userId: typingStatesTable.userId, updatedAt: typingStatesTable.updatedAt })
    .from(typingStatesTable)
    .where(
      and(
        eq(typingStatesTable.conversationId, conversationId),
        gt(typingStatesTable.updatedAt, new Date(Date.now() - 6000)),
      ),
    );
  return rows.filter((r) => r.userId !== userId).map((r) => r.userId);
}

export async function nextMessageIdAfter(conversationId: number, afterId: number) {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), gt(messages.id, afterId)))
    .orderBy(asc(messages.id))
    .limit(50);
  return rows.map((r) => r.id);
}
