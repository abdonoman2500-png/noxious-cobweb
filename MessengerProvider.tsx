"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, del, patch, post, uploadMedia, type UploadedMedia } from "@/lib/client";
import { makeT, type TKey } from "@/lib/i18n";
import type {
  BootstrapDTO,
  CallDTO,
  ConversationDTO,
  Locale,
  MessageDTO,
  PulseDTO,
} from "@/lib/types";

export type Tab = "chats" | "groups" | "status" | "settings";

type MessengerContextValue = {
  boot: BootstrapDTO | null;
  locale: Locale;
  t: (key: TKey) => string;
  tab: Tab;
  setTab: (tab: Tab) => void;
  activeId: number | null;
  activeConversation: ConversationDTO | null;
  messages: MessageDTO[];
  loadingMessages: boolean;
  hasMore: boolean;
  typingNames: string[];
  toast: string | null;
  showToast: (message: string) => void;
  refresh: () => Promise<void>;
  openChat: (id: number) => void;
  closeChat: () => void;
  loadMore: () => void;
  sendMessage: (input: {
    conversationId: number;
    body: string;
    kind?: MessageDTO["kind"];
    mediaId?: string | null;
    replyToId?: number | null;
    forwardedFromId?: number | null;
  }) => Promise<void>;
  editMessage: (id: number, body: string) => Promise<void>;
  deleteMessage: (id: number) => Promise<void>;
  reactToMessage: (id: number, emoji: string) => Promise<void>;
  notifyTyping: () => void;
  markRead: (conversationId: number, messageId?: number) => void;
  startDirect: (publicId: string) => Promise<ConversationDTO | null>;
  createGroup: (name: string, memberIds: string[]) => Promise<ConversationDTO | null>;
  updateGroup: (id: number, patchBody: Record<string, unknown>) => Promise<void>;
  addMember: (id: number, publicId: string) => Promise<void>;
  removeMember: (id: number, userId: number) => Promise<void>;
  leaveConversation: (id: number) => Promise<void>;
  createStatus: (input: {
    kind: "text" | "image" | "video";
    body: string;
    mediaId?: string | null;
    background?: string;
    audience?: "everyone" | "contacts";
  }) => Promise<void>;
  viewStatus: (id: number) => void;
  updateSettings: (patchBody: Record<string, unknown>) => Promise<void>;
  blockUser: (publicId: string) => Promise<void>;
  unblockUser: (publicId: string) => Promise<void>;
  reportUser: (publicId: string, reason: string, details: string) => Promise<void>;
  upload: (file: File, kind?: string) => Promise<UploadedMedia>;
  call: CallDTO | null;
  startCall: (conversationId: number, kind: "audio" | "video") => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  iceServers: BootstrapDTO["iceServers"];
  forwardTarget: MessageDTO | null;
  setForwardTarget: (message: MessageDTO | null) => void;
};

const MessengerContext = createContext<MessengerContextValue | null>(null);

export function useMessenger(): MessengerContextValue {
  const ctx = useContext(MessengerContext);
  if (!ctx) throw new Error("useMessenger must be used inside MessengerProvider");
  return ctx;
}

export function MessengerProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<BootstrapDTO | null>(null);
  const [tab, setTab] = useState<Tab>("chats");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [call, setCall] = useState<CallDTO | null>(null);

  const lastLoadedRef = useRef<Record<number, number>>({});
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingSentAt = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locale: Locale = boot?.me.locale ?? "ar";
  const t = useMemo(() => makeT(locale), [locale]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<BootstrapDTO>("/api/bootstrap");
      setBoot(data);
      setCall((current) => {
        if (current) {
          const stillActive = data.activeCall?.id === current.id || data.incomingCall?.id === current.id;
          if (!stillActive) return null;
          return data.activeCall?.id === current.id ? data.activeCall : data.incomingCall;
        }
        return data.activeCall ?? data.incomingCall ?? null;
      });
    } catch {
      // keep the previous snapshot; the poller will retry
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      void refresh();
    }, 350);
  }, [refresh]);

  // Initial load
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // SSE stream for instant events
  useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      source = new EventSource("/api/stream");
      source.addEventListener("ready", () => {
        if (retry) clearTimeout(retry);
      });
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as {
            type?: string;
            conversationId?: number;
            payload?: { message?: MessageDTO };
          };
          if (payload.type === "message:new" && payload.payload?.message) {
            const incoming = payload.payload.message;
            setMessages((current) => {
              if (current.some((m) => m.id === incoming.id)) return current;
              return [...current, incoming];
            });
            if (activeIdRef.current === incoming.conversationId) {
              markReadRef.current(incoming.conversationId, incoming.id);
            }
          }
          scheduleRefresh();
        } catch {
          scheduleRefresh();
        }
      };
      source.onerror = () => {
        source?.close();
        retry = setTimeout(connect, 4000);
      };
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, [scheduleRefresh]);

  // Polling safety net (works even if SSE is blocked by a proxy)
  useEffect(() => {
    let previous = "";
    const interval = setInterval(async () => {
      try {
        const pulse = await apiFetch<PulseDTO>("/api/pulse");
        const signature = JSON.stringify({
          c: pulse.conversations.map((c) => [c.id, c.lastMessageId, c.unreadCount]),
          t: pulse.typing.map((x) => [x.conversationId, x.userId]),
          k: pulse.calls.map((c) => [c.id, c.status]),
        });
        if (signature !== previous) {
          previous = signature;
          scheduleRefresh();
        }
      } catch {
        // ignore transient errors
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [scheduleRefresh]);

  const activeIdRef = useRef<number | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const loadMessages = useCallback(async (conversationId: number, reset: boolean) => {
    setLoadingMessages(true);
    try {
      const before = reset ? undefined : lastLoadedRef.current[conversationId];
      const data = await apiFetch<{ messages: MessageDTO[]; hasMore: boolean }>(
        `/api/conversations/${conversationId}/messages?limit=30${before ? `&before=${before}` : ""}`,
      );
      setMessages((current) => {
        const base = reset ? [] : current;
        const merged = [...data.messages, ...base];
        const seen = new Set<number>();
        return merged
          .filter((m) => {
            if (seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
          })
          .sort((a, b) => a.id - b.id);
      });
      setHasMore(data.hasMore);
      if (data.messages.length > 0) {
        lastLoadedRef.current[conversationId] = data.messages[0].id;
      }
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const openChat = useCallback(
    (id: number) => {
      setActiveId(id);
      setMessages([]);
      lastLoadedRef.current[id] = Number.MAX_SAFE_INTEGER;
      void loadMessages(id, true);
      void apiFetch(`/api/conversations/${id}/read`, {
        method: "POST",
        body: JSON.stringify({}),
      }).catch(() => undefined);
      scheduleRefresh();
    },
    [loadMessages, scheduleRefresh],
  );

  const closeChat = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setTypingNames([]);
  }, []);

  const loadMore = useCallback(() => {
    if (activeId) void loadMessages(activeId, false);
  }, [activeId, loadMessages]);

  // Reload the open conversation when new messages arrive from elsewhere.
  useEffect(() => {
    if (!boot || !activeId) return;
    const conv = boot.conversations.find((c) => c.id === activeId);
    if (!conv) return;
    const lastId = conv.lastMessage?.id ?? 0;
    const loaded = lastLoadedRef.current[activeId] ?? 0;
    if (lastId > loaded) {
      void loadMessages(activeId, true);
    }
    const typing = boot.conversations.length ? undefined : undefined;
    void typing;
  }, [boot, activeId, loadMessages]);

  // Typing indicator names for the open conversation
  useEffect(() => {
    if (!activeId) {
      setTypingNames([]);
      return;
    }
    const fetchTyping = async () => {
      try {
        const data = await apiFetch<{ typing: string[] }>(
          `/api/conversations/${activeId}/typing`,
        );
        setTypingNames(data.typing);
      } catch {
        setTypingNames([]);
      }
    };
    void fetchTyping();
    const interval = setInterval(fetchTyping, 3000);
    return () => clearInterval(interval);
  }, [activeId, boot]);

  const markRead = useCallback((conversationId: number, messageId?: number) => {
    void apiFetch(`/api/conversations/${conversationId}/read`, {
      method: "POST",
      body: JSON.stringify({ messageId }),
    }).catch(() => undefined);
  }, []);

  const markReadRef = useRef(markRead);
  useEffect(() => {
    markReadRef.current = markRead;
  }, [markRead]);

  const notifyTyping = useCallback(() => {
    if (!activeId) return;
    const now = Date.now();
    if (now - typingSentAt.current < 3000) return;
    typingSentAt.current = now;
    void apiFetch(`/api/conversations/${activeId}/typing`, {
      method: "POST",
      body: JSON.stringify({ typing: true }),
    }).catch(() => undefined);
  }, [activeId]);

  const sendMessage = useCallback<MessengerContextValue["sendMessage"]>(
    async (input) => {
      const conversationId = input.conversationId;
      const clientId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      const optimistic: MessageDTO = {
        id: -Date.now(),
        conversationId,
        senderId: boot?.me.id ?? 0,
        senderName: boot?.me.displayName ?? "",
        senderPublicId: boot?.me.publicId ?? "",
        senderAvatar: boot?.me.avatarUrl ?? null,
        kind: input.kind ?? "text",
        body: input.body,
        mediaId: input.mediaId ?? null,
        mediaUrl: null,
        mediaName: null,
        mediaMime: null,
        mediaSize: null,
        replyTo: input.replyToId
          ? (() => {
              const target = messages.find((m) => m.id === input.replyToId);
              return target
                ? { id: target.id, senderName: target.senderName, body: target.body, kind: target.kind }
                : null;
            })()
          : null,
        forwardedFrom: null,
        reactions: [],
        deliveredCount: 0,
        readCount: 0,
        editedAt: null,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      setMessages((current) => [...current, optimistic]);
      try {
        const data = await post<{ message: MessageDTO }>(
          `/api/conversations/${conversationId}/messages`,
          {
            body: input.body,
            kind: input.kind ?? "text",
            mediaId: input.mediaId ?? null,
            replyToId: input.replyToId ?? null,
            forwardedFromId: input.forwardedFromId ?? null,
            clientId,
          },
        );
        setMessages((current) =>
          current.map((m) => (m.id === optimistic.id ? data.message : m)),
        );
        lastLoadedRef.current[conversationId] = data.message.id;
        scheduleRefresh();
      } catch {
        setMessages((current) =>
          current.map((m) => (m.id === optimistic.id ? { ...m, pending: false, failed: true } : m)),
        );
      }
    },
    [boot, messages, scheduleRefresh],
  );

  const editMessage = useCallback(
    async (id: number, body: string) => {
      const data = await patch<{ message: MessageDTO }>(`/api/messages/${id}`, { body });
      setMessages((current) => current.map((m) => (m.id === id ? data.message : m)));
    },
    [],
  );

  const deleteMessage = useCallback(async (id: number) => {
    await del(`/api/messages/${id}`);
    setMessages((current) => current.filter((m) => m.id !== id));
    scheduleRefresh();
  }, [scheduleRefresh]);

  const reactToMessage = useCallback(async (id: number, emoji: string) => {
    const data = await post<{ message: MessageDTO }>(`/api/messages/${id}`, { emoji });
    setMessages((current) => current.map((m) => (m.id === id ? data.message : m)));
  }, []);

  const startDirect = useCallback<MessengerContextValue["startDirect"]>(
    async (publicId) => {
      const data = await post<{ conversation: ConversationDTO | null }>("/api/conversations", {
        type: "direct",
        publicId,
      });
      await refresh();
      if (data.conversation) openChat(data.conversation.id);
      return data.conversation;
    },
    [openChat, refresh],
  );

  const createGroup = useCallback<MessengerContextValue["createGroup"]>(
    async (name, memberIds) => {
      const data = await post<{ conversation: ConversationDTO | null }>("/api/conversations", {
        type: "group",
        name,
        memberIds,
      });
      await refresh();
      if (data.conversation) openChat(data.conversation.id);
      return data.conversation;
    },
    [openChat, refresh],
  );

  const updateGroup = useCallback(
    async (id: number, patchBody: Record<string, unknown>) => {
      await patch(`/api/conversations/${id}`, patchBody);
      await refresh();
    },
    [refresh],
  );

  const addMember = useCallback(
    async (id: number, publicId: string) => {
      await post(`/api/conversations/${id}/members`, { publicId });
      await refresh();
    },
    [refresh],
  );

  const removeMember = useCallback(
    async (id: number, userId: number) => {
      await del(`/api/conversations/${id}/members?userId=${userId}`);
      await refresh();
    },
    [refresh],
  );

  const leaveConversation = useCallback(
    async (id: number) => {
      await del(`/api/conversations/${id}`);
      closeChat();
      await refresh();
    },
    [closeChat, refresh],
  );

  const createStatus = useCallback<MessengerContextValue["createStatus"]>(
    async (input) => {
      await post("/api/statuses", input);
      await refresh();
    },
    [refresh],
  );

  const viewStatus = useCallback((id: number) => {
    void post(`/api/statuses/${id}/view`, {}).catch(() => undefined);
  }, []);

  const updateSettings = useCallback(
    async (patchBody: Record<string, unknown>) => {
      await patch("/api/auth", patchBody);
      await refresh();
    },
    [refresh],
  );

  const blockUser = useCallback(
    async (publicId: string) => {
      await post("/api/safety", { action: "block", publicId });
      await refresh();
    },
    [refresh],
  );

  const unblockUser = useCallback(
    async (publicId: string) => {
      await post("/api/safety", { action: "unblock", publicId });
      await refresh();
    },
    [refresh],
  );

  const reportUser = useCallback(
    async (publicId: string, reason: string, details: string) => {
      await post("/api/safety", { action: "report", publicId, reason, details });
    },
    [],
  );

  const upload = useCallback(async (file: File, kind?: string) => uploadMedia(file, kind), []);

  const startCall = useCallback(
    async (conversationId: number, kind: "audio" | "video") => {
      const data = await post<{ callId: number; kind: "audio" | "video" }>("/api/calls", {
        conversationId,
        kind,
      });
      const conv = boot?.conversations.find((c) => c.id === conversationId);
      setCall({
        id: data.callId,
        conversationId,
        callerId: boot?.me.id ?? 0,
        callerName: boot?.me.displayName ?? "",
        calleeId: conv?.peer?.id ?? null,
        kind: data.kind,
        status: "ringing",
        direction: "outgoing",
        peerName: conv?.name ?? "",
        startedAt: new Date().toISOString(),
        answeredAt: null,
        durationSeconds: 0,
      });
    },
    [boot],
  );

  const acceptCall = useCallback(async () => {
    if (!call) return;
    await patch("/api/calls", { callId: call.id, action: "accept" });
    setCall({ ...call, status: "accepted", direction: "incoming" });
  }, [call]);

  const rejectCall = useCallback(async () => {
    if (!call) return;
    await patch("/api/calls", { callId: call.id, action: "reject" }).catch(() => undefined);
    setCall(null);
  }, [call]);

  const endCall = useCallback(async () => {
    if (!call) return;
    await patch("/api/calls", { callId: call.id, action: "end" }).catch(() => undefined);
    setCall(null);
    scheduleRefresh();
  }, [call, scheduleRefresh]);

  const activeConversation = useMemo(
    () => boot?.conversations.find((c) => c.id === activeId) ?? null,
    [boot, activeId],
  );

  const value: MessengerContextValue = {
    boot,
    locale,
    t,
    tab,
    setTab,
    activeId,
    activeConversation,
    messages,
    loadingMessages,
    hasMore,
    typingNames,
    toast,
    showToast,
    refresh,
    openChat,
    closeChat,
    loadMore,
    sendMessage,
    editMessage,
    deleteMessage,
    reactToMessage,
    notifyTyping,
    markRead,
    startDirect,
    createGroup,
    updateGroup,
    addMember,
    removeMember,
    leaveConversation,
    createStatus,
    viewStatus,
    updateSettings,
    blockUser,
    unblockUser,
    reportUser,
    upload,
    call,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    iceServers: boot?.iceServers ?? [],
    forwardTarget: null,
    setForwardTarget: () => undefined,
  };

  return <MessengerContext.Provider value={value}>{children}</MessengerContext.Provider>;
}
