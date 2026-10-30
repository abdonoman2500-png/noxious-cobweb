export type Locale = "ar" | "en";

export type PublicUser = {
  id: number;
  publicId: string;
  displayName: string;
  avatarUrl: string | null;
  about: string;
  online: boolean;
  lastSeenAt: string;
};

export type MessageDTO = {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  senderPublicId: string;
  senderAvatar: string | null;
  kind: "text" | "image" | "video" | "audio" | "document";
  body: string;
  mediaId: string | null;
  mediaUrl: string | null;
  mediaName: string | null;
  mediaMime: string | null;
  mediaSize: number | null;
  replyTo: { id: number; senderName: string; body: string; kind: string } | null;
  forwardedFrom: string | null;
  reactions: { emoji: string; count: number; mine: boolean }[];
  deliveredCount: number;
  readCount: number;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  pending?: boolean;
  failed?: boolean;
};

export type ConversationMemberDTO = {
  id: number;
  publicId: string;
  displayName: string;
  avatarUrl: string | null;
  role: "member" | "admin";
  online: boolean;
};

export type ConversationDTO = {
  id: number;
  type: "direct" | "group";
  name: string;
  avatarUrl: string | null;
  description: string;
  peer: PublicUser | null;
  members: ConversationMemberDTO[];
  memberCount: number;
  lastMessage: MessageDTO | null;
  unreadCount: number;
  lastMessageAt: string;
  muted: boolean;
  role: "member" | "admin";
  sendPermission: "all" | "admins";
  blocked: boolean;
  iBlocked: boolean;
};

export type StatusDTO = {
  id: number;
  userId: number;
  userName: string;
  userAvatar: string | null;
  userPublicId: string;
  kind: "text" | "image" | "video";
  body: string;
  mediaUrl: string | null;
  background: string;
  audience: "everyone" | "contacts";
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
  viewCount: number;
  mine: boolean;
};

export type CallDTO = {
  id: number;
  conversationId: number;
  callerId: number;
  callerName: string;
  calleeId: number | null;
  kind: "audio" | "video";
  status: "ringing" | "accepted" | "rejected" | "ended" | "missed";
  direction: "incoming" | "outgoing";
  peerName: string;
  startedAt: string;
  answeredAt: string | null;
  durationSeconds: number;
};

export type MeDTO = {
  id: number;
  publicId: string;
  email: string;
  displayName: string;
  about: string;
  avatarUrl: string | null;
  locale: Locale;
  theme: "light" | "dark";
  wallpaper: string;
  lastSeenVisibility: string;
  profileVisibility: string;
  readReceipts: boolean;
  pushEnabled: boolean;
};

export type BootstrapDTO = {
  me: MeDTO;
  conversations: ConversationDTO[];
  statuses: StatusDTO[];
  blocked: PublicUser[];
  activeCall: CallDTO | null;
  incomingCall: CallDTO | null;
  vapidPublicKey: string | null;
  iceServers: { urls: string | string[]; username?: string; credential?: string }[];
  serverTime: string;
};

export type PulseDTO = {
  serverTime: string;
  conversations: { id: number; lastMessageId: number; lastMessageAt: string; unreadCount: number }[];
  typing: { conversationId: number; userId: number; displayName: string }[];
  calls: CallDTO[];
  statuses: { id: number; userId: number; viewed: boolean }[];
};
