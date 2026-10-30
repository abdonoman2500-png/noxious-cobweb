import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    /** Immutable public identifier, 8 chars, e.g. "K7M2QX9P". Never changes. */
    publicId: varchar("public_id", { length: 8 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: varchar("display_name", { length: 80 }).notNull(),
    about: varchar("about", { length: 160 }).notNull().default(""),
    avatarUrl: text("avatar_url"),
    locale: varchar("locale", { length: 5 }).notNull().default("ar"),
    theme: varchar("theme", { length: 10 }).notNull().default("light"),
    wallpaper: varchar("wallpaper", { length: 24 }).notNull().default("dusk"),
    lastSeenVisibility: varchar("last_seen_visibility", { length: 12 })
      .notNull()
      .default("everyone"),
    profileVisibility: varchar("profile_visibility", { length: 12 })
      .notNull()
      .default("everyone"),
    readReceipts: boolean("read_receipts").notNull().default(true),
    pushEnabled: boolean("push_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_public_id_uq").on(t.publicId),
    uniqueIndex("users_email_uq").on(t.email),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    deviceName: varchar("device_name", { length: 120 }).notNull().default("Unknown device"),
    platform: varchar("platform", { length: 40 }).notNull().default("web"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("sessions_token_uq").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("password_resets_token_uq").on(t.tokenHash)],
);

/* ------------------------------------------------------------------ */
/* Conversations                                                       */
/* ------------------------------------------------------------------ */

export const conversations = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    /** "direct" | "group" */
    type: varchar("type", { length: 10 }).notNull().default("direct"),
    /** Sorted "a:b" key that guarantees a single direct conversation per pair. */
    directKey: varchar("direct_key", { length: 64 }),
    name: varchar("name", { length: 80 }),
    description: varchar("description", { length: 240 }).notNull().default(""),
    avatarUrl: text("avatar_url"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    /** "all" | "admins" */
    sendPermission: varchar("send_permission", { length: 10 }).notNull().default("all"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("conversations_direct_key_uq").on(t.directKey),
    index("conversations_last_message_idx").on(t.lastMessageAt),
  ],
);

export const conversationMembers = pgTable(
  "conversation_members",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "member" | "admin" */
    role: varchar("role", { length: 10 }).notNull().default("member"),
    muted: boolean("muted").notNull().default(false),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("conversation_members_uq").on(t.conversationId, t.userId),
    index("conversation_members_user_idx").on(t.userId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: integer("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "text" | "image" | "video" | "audio" | "document" */
    kind: varchar("kind", { length: 12 }).notNull().default("text"),
    body: text("body").notNull().default(""),
    mediaId: varchar("media_id", { length: 40 }),
    replyToId: integer("reply_to_id"),
    forwardedFromId: integer("forwarded_from_id"),
    clientId: varchar("client_id", { length: 64 }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId, t.id),
    index("messages_sender_idx").on(t.senderId),
    uniqueIndex("messages_client_uq").on(t.conversationId, t.senderId, t.clientId),
  ],
);

export const messageReceipts = pgTable(
  "message_receipts",
  {
    id: serial("id").primaryKey(),
    messageId: integer("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("message_receipts_uq").on(t.messageId, t.userId)],
);

export const reactions = pgTable(
  "reactions",
  {
    id: serial("id").primaryKey(),
    messageId: integer("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: varchar("emoji", { length: 16 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reactions_uq").on(t.messageId, t.userId, t.emoji)],
);

export const typingStates = pgTable(
  "typing_states",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("typing_states_uq").on(t.conversationId, t.userId)],
);

/* ------------------------------------------------------------------ */
/* Safety                                                              */
/* ------------------------------------------------------------------ */

export const blocks = pgTable(
  "blocks",
  {
    id: serial("id").primaryKey(),
    blockerId: integer("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: integer("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("blocks_uq").on(t.blockerId, t.blockedId)],
);

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  reporterId: integer("reporter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  targetUserId: integer("target_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reason: varchar("reason", { length: 60 }).notNull(),
  details: text("details").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

export const media = pgTable(
  "media",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "image" | "video" | "audio" | "document" */
    kind: varchar("kind", { length: 12 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    fileName: varchar("file_name", { length: 200 }).notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("media_owner_idx").on(t.ownerId)],
);

/* ------------------------------------------------------------------ */
/* Status (24h stories)                                                */
/* ------------------------------------------------------------------ */

export const statuses = pgTable(
  "statuses",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "text" | "image" | "video" */
    kind: varchar("kind", { length: 10 }).notNull().default("text"),
    body: text("body").notNull().default(""),
    mediaId: varchar("media_id", { length: 40 }),
    background: varchar("background", { length: 24 }).notNull().default("grad-1"),
    /** "everyone" | "contacts" */
    audience: varchar("audience", { length: 12 }).notNull().default("everyone"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("statuses_user_idx").on(t.userId), index("statuses_expiry_idx").on(t.expiresAt)],
);

export const statusViews = pgTable(
  "status_views",
  {
    id: serial("id").primaryKey(),
    statusId: integer("status_id")
      .notNull()
      .references(() => statuses.id, { onDelete: "cascade" }),
    viewerId: integer("viewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("status_views_uq").on(t.statusId, t.viewerId)],
);

/* ------------------------------------------------------------------ */
/* Calls (WebRTC signaling)                                            */
/* ------------------------------------------------------------------ */

export const calls = pgTable(
  "calls",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    callerId: integer("caller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    calleeId: integer("callee_id").references(() => users.id, { onDelete: "cascade" }),
    /** "audio" | "video" */
    kind: varchar("kind", { length: 10 }).notNull().default("audio"),
    /** "ringing" | "accepted" | "rejected" | "ended" | "missed" */
    status: varchar("status", { length: 12 }).notNull().default("ringing"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds").notNull().default(0),
  },
  (t) => [index("calls_callee_idx").on(t.calleeId), index("calls_conversation_idx").on(t.conversationId)],
);

export const callSignals = pgTable(
  "call_signals",
  {
    id: serial("id").primaryKey(),
    callId: integer("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    fromUserId: integer("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "offer" | "answer" | "candidate" */
    kind: varchar("kind", { length: 12 }).notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("call_signals_call_idx").on(t.callId, t.id)],
);

/* ------------------------------------------------------------------ */
/* Push + app settings                                                 */
/* ------------------------------------------------------------------ */

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: varchar("user_agent", { length: 300 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    failureCount: integer("failure_count").notNull().default(0),
  },
  (t) => [uniqueIndex("push_subscriptions_endpoint_uq").on(t.endpoint)],
);

export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
