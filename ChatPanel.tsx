"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMessenger } from "@/components/MessengerProvider";
import { Avatar, Field, Icon, Modal, buttonGhost, buttonPrimary, inputClass } from "@/components/ui";
import { dayLabel, fileKindFromMime, formatBytes, formatClock, timeAgo } from "@/lib/format";
import type { ConversationDTO, MessageDTO, PublicUser } from "@/lib/types";

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"];

function uploadWithProgress(
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ id: string; url: string; kind: string; mimeType: string; name: string; size: number }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", fileKindFromMime(file.type));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText) as {
          media?: { id: string; url: string; kind: string; mimeType: string; name: string; size: number };
          error?: string;
        };
        if (xhr.status >= 200 && xhr.status < 300 && data.media) resolve(data.media);
        else reject(new Error(data.error ?? "upload_failed"));
      } catch {
        reject(new Error("upload_failed"));
      }
    };
    xhr.onerror = () => reject(new Error("upload_failed"));
    xhr.send(form);
  });
}

export function ChatPanel() {
  const {
    boot,
    t,
    locale,
    activeId,
    activeConversation,
    openChat,
    closeChat,
    messages,
    loadingMessages,
    hasMore,
    loadMore,
    typingNames,
    sendMessage,
    editMessage,
    deleteMessage,
    reactToMessage,
    notifyTyping,
    markRead,
    startDirect,
    createGroup,
    startCall,
    showToast,
    upload,
  } = useMessenger();

  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [replyTo, setReplyTo] = useState<MessageDTO | null>(null);
  const [editing, setEditing] = useState<MessageDTO | null>(null);
  const [forwarding, setForwarding] = useState<MessageDTO | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [actionFor, setActionFor] = useState<MessageDTO | null>(null);

  const conversations = boot?.conversations ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === "unread" && c.unreadCount === 0) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.peer?.publicId ?? "").toLowerCase().includes(q)
      );
    });
  }, [conversations, filter, query]);

  const handleSend = async (body: string, mediaId?: string | null, kind?: MessageDTO["kind"]) => {
    if (!activeId) return;
    await sendMessage({
      conversationId: activeId,
      body,
      kind: kind ?? "text",
      mediaId: mediaId ?? null,
      replyToId: replyTo?.id ?? null,
      forwardedFromId: forwarding?.id ?? null,
    });
    setReplyTo(null);
    setForwarding(null);
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Conversation list */}
      <aside
        className={`${activeId ? "hidden md:flex" : "flex"} h-full w-full shrink-0 flex-col border-e border-[var(--border)] bg-[var(--surface)] md:w-[340px] lg:w-[380px]`}
      >
        <header className="flex items-center justify-between gap-2 px-4 py-3">
          <div>
            <h1 className="text-lg font-bold">{t("chats")}</h1>
            <p className="text-xs text-[var(--muted)]">
              {boot ? `${boot.me.displayName} · ${boot.me.publicId}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowGroup(true)}
              className="rounded-full p-2 text-[var(--muted)] hover:bg-[var(--surface-2)]"
              title={t("newGroup")}
            >
              <Icon name="group" />
            </button>
            <button
              onClick={() => setShowNew(true)}
              className="rounded-full bg-[var(--brand)] p-2 text-white hover:bg-[var(--brand-strong)]"
              title={t("newChat")}
            >
              <Icon name="plus" />
            </button>
          </div>
        </header>

        <div className="px-3">
          <div className="flex items-center gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-2">
            <Icon name="search" className="h-4 w-4 text-[var(--muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("search")}
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div className="mt-2 flex gap-2 text-xs">
            {(["all", "unread"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-full px-3 py-1 transition ${
                  filter === key
                    ? "bg-[var(--brand)] text-white"
                    : "bg-[var(--surface-2)] text-[var(--muted)]"
                }`}
              >
                {key === "all" ? t("all") : `${t("unreadFilter")} (${conversations.filter((c) => c.unreadCount > 0).length})`}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2 flex-1 overflow-y-auto px-2 pb-4">
          {filtered.length === 0 && (
            <div className="mt-10 px-4 text-center text-sm text-[var(--muted)]">
              <p className="font-medium">{t("noChats")}</p>
              <p className="mt-1 text-xs">{t("noChatsHint")}</p>
              <button onClick={() => setShowNew(true)} className={`${buttonPrimary} mt-4`}>
                <Icon name="plus" className="h-4 w-4" />
                {t("newChat")}
              </button>
            </div>
          )}
          {filtered.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeId}
              onClick={() => openChat(conversation.id)}
            />
          ))}
        </div>
      </aside>

      {/* Chat window */}
      <section className={`${activeId ? "flex" : "hidden md:flex"} h-full min-w-0 flex-1 flex-col`}>
        {activeConversation ? (
          <ChatWindow
            conversation={activeConversation}
            messages={messages}
            loading={loadingMessages}
            hasMore={hasMore}
            onLoadMore={loadMore}
            onBack={closeChat}
            typingNames={typingNames}
            onReply={setReplyTo}
            onEdit={setEditing}
            onForward={setForwarding}
            onDelete={async (message) => {
              await deleteMessage(message.id);
              showToast(t("deleted"));
            }}
            onReact={reactToMessage}
            onSend={handleSend}
            onTyping={notifyTyping}
            onRead={(id) => markRead(activeConversation.id, id)}
            onCall={(kind) => void startCall(activeConversation.id, kind)}
            onInfo={() => setInfoOpen(true)}
            onUpload={async (file) => {
              const media = await uploadWithProgress(file, () => undefined);
              return media;
            }}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            editing={editing}
            onCancelEdit={() => setEditing(null)}
            onSaveEdit={async (body) => {
              if (editing) await editMessage(editing.id, body);
              setEditing(null);
            }}
            forwarding={forwarding}
            onCancelForward={() => setForwarding(null)}
            locale={locale}
            meId={boot?.me.id ?? 0}
            memberCount={activeConversation.memberCount}
          />
        ) : (
          <div className="chat-wallpaper flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="brand-gradient flex h-16 w-16 items-center justify-center rounded-2xl text-white">
              <Icon name="chat" className="h-8 w-8" />
            </div>
            <h2 className="text-lg font-semibold">{t("selectChat")}</h2>
            <p className="max-w-sm text-sm text-[var(--muted)]">{t("selectChatHint")}</p>
          </div>
        )}
      </section>

      <NewChatDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onStart={async (user) => {
          await startDirect(user.publicId);
          setShowNew(false);
        }}
        t={t}
      />
      <NewGroupDialog
        open={showGroup}
        onClose={() => setShowGroup(false)}
        onCreate={async (name, ids) => {
          await createGroup(name, ids);
          setShowGroup(false);
        }}
        t={t}
      />
      <ForwardDialog
        message={forwarding}
        conversations={conversations}
        onClose={() => setForwarding(null)}
        onPick={async (conversation) => {
          if (!forwarding) return;
          await sendMessage({
            conversationId: conversation.id,
            body: forwarding.body,
            kind: forwarding.kind,
            mediaId: forwarding.mediaId,
            forwardedFromId: forwarding.id,
          });
          setForwarding(null);
          showToast(t("forwardDone"));
        }}
        t={t}
      />
      <GroupInfoDialog
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        conversation={activeConversation}
        t={t}
      />
    </div>
  );
}

function ConversationRow({
  conversation,
  active,
  onClick,
}: {
  conversation: ConversationDTO;
  active: boolean;
  onClick: () => void;
}) {
  const { t, locale } = useMessenger();
  const last = conversation.lastMessage;
  const preview = last
    ? last.deletedAt
      ? t("deleted")
      : last.kind === "text"
        ? last.body
        : last.kind === "image"
          ? `📷 ${t("photo")}`
          : last.kind === "video"
            ? `🎥 ${t("video")}`
            : last.kind === "audio"
              ? `🎙️ ${t("audio")}`
              : `📄 ${t("document")}`
    : t("noChats");

  return (
    <button
      onClick={onClick}
      className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition ${
        active ? "bg-[var(--brand-soft)]" : "hover:bg-[var(--surface-2)]"
      }`}
    >
      <Avatar
        name={conversation.name}
        src={conversation.avatarUrl}
        online={conversation.type === "direct" ? conversation.peer?.online : undefined}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{conversation.name}</span>
          <span className="shrink-0 text-[11px] text-[var(--muted)]">
            {last ? timeAgo(last.createdAt, locale) : ""}
          </span>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-[var(--muted)]">{preview}</span>
          {conversation.unreadCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand)] px-1.5 text-[11px] font-bold text-white">
              {conversation.unreadCount}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function ChatWindow({
  conversation,
  messages,
  loading,
  hasMore,
  onLoadMore,
  onBack,
  typingNames,
  onReply,
  onEdit,
  onForward,
  onDelete,
  onReact,
  onSend,
  onTyping,
  onRead,
  onCall,
  onInfo,
  onUpload,
  replyTo,
  onCancelReply,
  editing,
  onCancelEdit,
  onSaveEdit,
  forwarding,
  onCancelForward,
  locale,
  meId,
  memberCount,
}: {
  conversation: ConversationDTO;
  messages: MessageDTO[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onBack: () => void;
  typingNames: string[];
  onReply: (message: MessageDTO) => void;
  onEdit: (message: MessageDTO) => void;
  onForward: (message: MessageDTO) => void;
  onDelete: (message: MessageDTO) => void;
  onReact: (id: number, emoji: string) => void;
  onSend: (body: string, mediaId?: string | null, kind?: MessageDTO["kind"]) => Promise<void>;
  onTyping: () => void;
  onRead: (messageId: number) => void;
  onCall: (kind: "audio" | "video") => void;
  onInfo: () => void;
  onUpload: (file: File) => Promise<{ id: string; url: string; kind: string; mimeType: string; name: string; size: number }>;
  replyTo: MessageDTO | null;
  onCancelReply: () => void;
  editing: MessageDTO | null;
  onCancelEdit: () => void;
  onSaveEdit: (body: string) => Promise<void>;
  forwarding: MessageDTO | null;
  onCancelForward: () => void;
  locale: "ar" | "en";
  meId: number;
  memberCount: number;
}) {
  const { t, boot } = useMessenger();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [showAttach, setShowAttach] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [actionFor, setActionFor] = useState<MessageDTO | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const imageInput = useRef<HTMLInputElement | null>(null);
  const videoInput = useRef<HTMLInputElement | null>(null);
  const docInput = useRef<HTMLInputElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const wallpaper = boot?.me.wallpaper ?? "dusk";
  const canSend =
    conversation.type === "direct" ||
    conversation.sendPermission === "all" ||
    conversation.role === "admin";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, conversation.id]);

  const onReadRef = useRef(onRead);
  useEffect(() => {
    onReadRef.current = onRead;
  }, [onRead]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last && last.senderId !== meId) onReadRef.current(last.id);
  }, [messages, meId]);

  useEffect(() => {
    if (editing) setDraft(editing.body);
  }, [editing]);

  useEffect(() => {
    if (!recording) return;
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [recording]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      if (editing) await onSaveEdit(body);
      else await onSend(body);
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  const handleFile = async (file: File) => {
    setShowAttach(false);
    setProgress(0);
    try {
      const media = await onUpload(file);
      await onSend("", media.id, media.kind as MessageDTO["kind"]);
    } catch {
      setProgress(null);
    } finally {
      setProgress(null);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorderInstance = new MediaRecorder(stream);
      chunks.current = [];
      recorderInstance.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      recorderInstance.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: recorderInstance.mimeType || "audio/webm" });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
        setRecording(false);
        setSeconds(0);
        await handleFile(file);
      };
      recorder.current = recorderInstance;
      recorderInstance.start();
      setSeconds(0);
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };

  const stopRecording = () => {
    recorder.current?.stop();
    recorder.current = null;
  };

  return (
    <>
      <header className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
        <button onClick={onBack} className="rounded-full p-1.5 text-[var(--muted)] md:hidden">
          <Icon name="back" />
        </button>
        <Avatar
          name={conversation.name}
          src={conversation.avatarUrl}
          online={conversation.type === "direct" ? conversation.peer?.online : undefined}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{conversation.name}</p>
          <p className="truncate text-xs text-[var(--muted)]">
            {typingNames.length > 0
              ? `${typingNames.join("، ")} ${t("typing")}`
              : conversation.type === "direct"
                ? conversation.peer?.online
                  ? t("online")
                  : `${t("lastSeen")} ${conversation.peer ? timeAgo(conversation.peer.lastSeenAt, locale) : ""}`
                : `${conversation.memberCount} ${t("members")}`}
          </p>
        </div>
        <button
          onClick={() => onCall("audio")}
          className="rounded-full p-2 text-[var(--muted)] hover:bg-[var(--surface-2)]"
          title={t("voiceCall")}
        >
          <Icon name="phone" />
        </button>
        <button
          onClick={() => onCall("video")}
          className="rounded-full p-2 text-[var(--muted)] hover:bg-[var(--surface-2)]"
          title={t("videoCall")}
        >
          <Icon name="video" />
        </button>
        <button
          onClick={onInfo}
          className="rounded-full p-2 text-[var(--muted)] hover:bg-[var(--surface-2)]"
          title={t("groupInfo")}
        >
          <Icon name="more" />
        </button>
      </header>

      <div className={`chat-wallpaper wallpaper-${wallpaper} flex-1 overflow-y-auto px-3 py-4`}>
        {hasMore && (
          <div className="mb-3 text-center">
            <button onClick={onLoadMore} className={`${buttonGhost} text-xs`}>
              {t("loadMore")}
            </button>
          </div>
        )}
        {loading && messages.length === 0 && (
          <p className="py-10 text-center text-sm text-[var(--muted)]">{t("loading")}</p>
        )}
        <div className="mx-auto flex max-w-3xl flex-col gap-1">
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const showDay =
              !previous ||
              dayLabel(previous.createdAt, locale) !== dayLabel(message.createdAt, locale);
            return (
              <div key={message.id}>
                {showDay && (
                  <div className="my-3 text-center">
                    <span className="rounded-full bg-[var(--surface)]/80 px-3 py-1 text-[11px] font-medium text-[var(--muted)] shadow-sm">
                      {dayLabel(message.createdAt, locale)}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={message}
                  mine={message.senderId === meId}
                  memberCount={memberCount}
                  locale={locale}
                  onReply={() => onReply(message)}
                  onEdit={() => onEdit(message)}
                  onForward={() => onForward(message)}
                  onDelete={() => onDelete(message)}
                  onReact={(emoji) => onReact(message.id, emoji)}
                  onOpenActions={() => setActionFor(message)}
                />
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {progress !== null && (
        <div className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full bg-[var(--brand)] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            {t("uploading")} {progress}%
          </p>
        </div>
      )}

      {(replyTo || forwarding || editing) && (
        <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs">
          <div className="min-w-0">
            <p className="font-semibold text-[var(--brand)]">
              {editing ? t("edit") : forwarding ? t("forward") : t("reply")}
            </p>
            <p className="truncate text-[var(--muted)]">
              {(editing ?? forwarding ?? replyTo)?.body || (editing ?? forwarding ?? replyTo)?.kind}
            </p>
          </div>
          <button
            onClick={() => {
              onCancelReply();
              onCancelForward();
              onCancelEdit();
              setDraft("");
            }}
            className="rounded-full p-1 text-[var(--muted)]"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="border-t border-[var(--border)] bg-[var(--surface)] px-3 py-2">
        {showEmoji && (
          <div className="mb-2 flex flex-wrap gap-1">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => setDraft((current) => current + emoji)}
                className="rounded-lg px-2 py-1 text-lg hover:bg-[var(--surface-2)]"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        {showAttach && (
          <div className="mb-2 flex flex-wrap gap-2">
            <button onClick={() => imageInput.current?.click()} className={`${buttonGhost} text-xs`}>
              <Icon name="image" className="h-4 w-4" /> {t("photo")}
            </button>
            <button onClick={() => videoInput.current?.click()} className={`${buttonGhost} text-xs`}>
              <Icon name="video" className="h-4 w-4" /> {t("video")}
            </button>
            <button onClick={() => docInput.current?.click()} className={`${buttonGhost} text-xs`}>
              <Icon name="doc" className="h-4 w-4" /> {t("document")}
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            onClick={() => setShowAttach((v) => !v)}
            className="rounded-full p-2 text-[var(--muted)] hover:bg-[var(--surface-2)]"
            title={t("attach")}
          >
            <Icon name="clip" />
          </button>
          <div className="flex flex-1 items-end gap-2 rounded-2xl bg-[var(--surface-2)] px-3 py-2">
            <button
              onClick={() => setShowEmoji((v) => !v)}
              className="text-[var(--muted)]"
              title="emoji"
            >
              <Icon name="smile" className="h-5 w-5" />
            </button>
            <textarea
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                onTyping();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              rows={1}
              placeholder={canSend ? t("message") : t("adminsOnly")}
              disabled={!canSend}
              className="max-h-32 min-h-8 flex-1 resize-none bg-transparent text-sm outline-none disabled:cursor-not-allowed"
            />
          </div>
          {recording ? (
            <button
              onClick={stopRecording}
              className="ring-pulse flex items-center gap-1 rounded-full bg-red-600 px-3 py-2 text-xs font-semibold text-white"
            >
              <Icon name="stop" className="h-4 w-4" />
              {seconds}s
            </button>
          ) : draft.trim() ? (
            <button
              onClick={() => void submit()}
              disabled={sending}
              className="rounded-full bg-[var(--brand)] p-2.5 text-white disabled:opacity-60"
              title={t("send")}
            >
              <Icon name={editing ? "check" : "send"} />
            </button>
          ) : (
            <button
              onClick={() => void startRecording()}
              className="rounded-full bg-[var(--brand)] p-2.5 text-white"
              title={t("record")}
            >
              <Icon name="mic" />
            </button>
          )}
        </div>
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = "";
          }}
        />
        <input
          ref={videoInput}
          type="file"
          accept="video/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = "";
          }}
        />
        <input
          ref={docInput}
          type="file"
          accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.zip"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = "";
          }}
        />
      </div>

      <Modal open={Boolean(actionFor)} onClose={() => setActionFor(null)} title={t("message")}>
        {actionFor && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReact(actionFor.id, emoji);
                    setActionFor(null);
                  }}
                  className="rounded-lg px-2 py-1 text-xl hover:bg-[var(--surface-2)]"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => {
                  onReply(actionFor);
                  setActionFor(null);
                }}
                className={`${buttonGhost} justify-start text-xs`}
              >
                <Icon name="reply" className="h-4 w-4" /> {t("reply")}
              </button>
              <button
                onClick={() => {
                  onForward(actionFor);
                  setActionFor(null);
                }}
                className={`${buttonGhost} justify-start text-xs`}
              >
                <Icon name="forward" className="h-4 w-4" /> {t("forward")}
              </button>
              {actionFor.senderId === meId && actionFor.kind === "text" && (
                <button
                  onClick={() => {
                    onEdit(actionFor);
                    setActionFor(null);
                  }}
                  className={`${buttonGhost} justify-start text-xs`}
                >
                  <Icon name="edit" className="h-4 w-4" /> {t("edit")}
                </button>
              )}
              {actionFor.senderId === meId && (
                <button
                  onClick={() => {
                    onDelete(actionFor);
                    setActionFor(null);
                  }}
                  className={`${buttonGhost} justify-start text-xs text-red-600`}
                >
                  <Icon name="trash" className="h-4 w-4" /> {t("delete")}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function MessageBubble({
  message,
  mine,
  memberCount,
  locale,
  onReply,
  onEdit,
  onForward,
  onDelete,
  onReact,
  onOpenActions,
}: {
  message: MessageDTO;
  mine: boolean;
  memberCount: number;
  locale: "ar" | "en";
  onReply: () => void;
  onEdit: () => void;
  onForward: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
  onOpenActions: () => void;
}) {
  const { t } = useMessenger();
  const [showActions, setShowActions] = useState(false);
  const others = Math.max(memberCount - 1, 1);
  const allRead = message.readCount >= others;
  const delivered = message.deliveredCount > 0;

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="group relative max-w-[85%] sm:max-w-[75%]">
        <div
          className={`animate-rise px-3 py-2 text-sm shadow-sm ${mine ? "bubble-out" : "bubble-in"}`}
          onDoubleClick={() => setShowActions((v) => !v)}
        >
          {message.forwardedFrom && (
            <p className="mb-1 text-[11px] font-semibold text-[var(--brand)]">{t("forwarded")}</p>
          )}
          {message.replyTo && (
            <div className="mb-1.5 rounded-lg border-s-2 border-[var(--brand)] bg-black/5 px-2 py-1 text-[11px] dark:bg-white/10">
              <p className="font-semibold">{message.replyTo.senderName}</p>
              <p className="truncate text-[var(--muted)]">{message.replyTo.body || message.replyTo.kind}</p>
            </div>
          )}
          {message.deletedAt ? (
            <p className="italic text-[var(--muted)]">{t("deleted")}</p>
          ) : (
            <>
              {message.kind === "image" && message.mediaUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={message.mediaUrl}
                  alt={message.mediaName ?? "image"}
                  className="mb-1 max-h-72 w-full rounded-lg object-cover"
                />
              )}
              {message.kind === "video" && message.mediaUrl && (
                <video src={message.mediaUrl} controls className="mb-1 max-h-72 w-full rounded-lg" />
              )}
              {message.kind === "audio" && message.mediaUrl && (
                <audio src={message.mediaUrl} controls className="mb-1 w-full" />
              )}
              {message.kind === "document" && message.mediaUrl && (
                <a
                  href={`${message.mediaUrl}?download=1`}
                  className="mb-1 flex items-center gap-2 rounded-lg bg-black/5 px-2 py-2 text-xs dark:bg-white/10"
                >
                  <Icon name="doc" className="h-5 w-5" />
                  <span className="min-w-0 flex-1 truncate">{message.mediaName ?? t("document")}</span>
                  <Icon name="download" className="h-4 w-4" />
                </a>
              )}
              {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
            </>
          )}
          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[var(--muted)]">
            {message.editedAt && <span>{t("edited")}</span>}
            <span>{formatClock(message.createdAt, locale)}</span>
            {mine && !message.pending && (
              <Icon
                name={allRead ? "checks" : "check"}
                className={`h-3.5 w-3.5 ${allRead ? "text-sky-500" : delivered ? "text-sky-500" : ""}`}
              />
            )}
            {message.pending && <Icon name="clock" className="h-3.5 w-3.5" />}
            {message.failed && <span className="text-red-500">{t("failed")}</span>}
          </div>
        </div>

        {message.reactions.length > 0 && (
          <div className={`mt-1 flex gap-1 ${mine ? "justify-end" : "justify-start"}`}>
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                onClick={() => onReact(reaction.emoji)}
                className={`rounded-full border px-1.5 py-0.5 text-[11px] ${
                  reaction.mine
                    ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                    : "border-[var(--border)] bg-[var(--surface)]"
                }`}
              >
                {reaction.emoji} {reaction.count}
              </button>
            ))}
          </div>
        )}

        {showActions && (
          <div
            className={`absolute -top-9 z-10 flex gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-1 py-1 shadow-lg ${
              mine ? "end-0" : "start-0"
            }`}
          >
            <button onClick={onReply} className="rounded-full p-1.5 hover:bg-[var(--surface-2)]" title={t("reply")}>
              <Icon name="reply" className="h-4 w-4" />
            </button>
            <button onClick={onForward} className="rounded-full p-1.5 hover:bg-[var(--surface-2)]" title={t("forward")}>
              <Icon name="forward" className="h-4 w-4" />
            </button>
            {mine && message.kind === "text" && (
              <button onClick={onEdit} className="rounded-full p-1.5 hover:bg-[var(--surface-2)]" title={t("edit")}>
                <Icon name="edit" className="h-4 w-4" />
              </button>
            )}
            {mine && (
              <button
                onClick={onDelete}
                className="rounded-full p-1.5 text-red-600 hover:bg-[var(--surface-2)]"
                title={t("delete")}
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onOpenActions}
              className="rounded-full p-1.5 hover:bg-[var(--surface-2)]"
              title="more"
            >
              <Icon name="more" className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function NewChatDialog({
  open,
  onClose,
  onStart,
  t,
}: {
  open: boolean;
  onClose: () => void;
  onStart: (user: PublicUser) => Promise<void>;
  t: (key: never) => string;
}) {
  const [publicId, setPublicId] = useState("");
  const [preview, setPreview] = useState<{ user: PublicUser; canMessage: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setPublicId("");
      setPreview(null);
      setError(null);
    }
  }, [open]);

  const lookup = async () => {
    setError(null);
    setPreview(null);
    try {
      const response = await fetch(`/api/users/lookup?publicId=${encodeURIComponent(publicId)}`);
      const data = (await response.json()) as {
        user?: PublicUser;
        canMessage?: boolean;
        error?: string;
      };
      if (!response.ok || !data.user) {
        setError(data.error === "not_found" ? t("userNotFound" as never) : t("invalidId" as never));
        return;
      }
      setPreview({ user: data.user, canMessage: Boolean(data.canMessage) });
    } catch {
      setError(t("errorGeneric" as never));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("newChat" as never)}>
      <div className="space-y-3">
        <Field label={t("searchId" as never)} hint={t("searchPlaceholder" as never)}>
          <div className="flex gap-2">
            <input
              value={publicId}
              onChange={(event) => setPublicId(event.target.value.toUpperCase())}
              placeholder="K7M2QX9P"
              className={inputClass}
            />
            <button onClick={() => void lookup()} className={buttonGhost} disabled={publicId.length < 6}>
              <Icon name="search" className="h-4 w-4" />
            </button>
          </div>
        </Field>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {preview && (
          <div className="rounded-xl border border-[var(--border)] p-3">
            <div className="flex items-center gap-3">
              <Avatar name={preview.user.displayName} src={preview.user.avatarUrl} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{preview.user.displayName}</p>
                <p className="text-xs text-[var(--muted)]">{preview.user.publicId}</p>
              </div>
            </div>
            {preview.user.about && (
              <p className="mt-2 text-xs text-[var(--muted)]">{preview.user.about}</p>
            )}
            <button
              disabled={!preview.canMessage || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onStart(preview.user);
                } finally {
                  setBusy(false);
                }
              }}
              className={`${buttonPrimary} mt-3 w-full`}
            >
              <Icon name="chat" className="h-4 w-4" />
              {preview.canMessage ? t("startChat" as never) : t("blockedUser" as never)}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function NewGroupDialog({
  open,
  onClose,
  onCreate,
  t,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, ids: string[]) => Promise<void>;
  t: (key: never) => string;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [entry, setEntry] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setIds([]);
      setEntry("");
    }
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={t("newGroup" as never)}>
      <div className="space-y-3">
        <Field label={t("groupName" as never)}>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label={t("groupDescription" as never)}>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={t("selectMembers" as never)} hint={t("searchPlaceholder" as never)}>
          <div className="flex gap-2">
            <input
              value={entry}
              onChange={(e) => setEntry(e.target.value.toUpperCase())}
              className={inputClass}
            />
            <button
              onClick={() => {
                const value = entry.trim();
                if (value.length >= 6 && !ids.includes(value)) setIds([...ids, value]);
                setEntry("");
              }}
              className={buttonGhost}
            >
              <Icon name="plus" className="h-4 w-4" />
            </button>
          </div>
        </Field>
        {ids.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {ids.map((id) => (
              <span
                key={id}
                className="rounded-full bg-[var(--brand-soft)] px-2 py-1 text-xs font-medium"
              >
                {id}
              </span>
            ))}
          </div>
        )}
        <button
          disabled={name.trim().length < 2 || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onCreate(name.trim(), ids);
            } finally {
              setBusy(false);
            }
          }}
          className={`${buttonPrimary} w-full`}
        >
          {t("create" as never)}
        </button>
      </div>
    </Modal>
  );
}

function ForwardDialog({
  message,
  conversations,
  onClose,
  onPick,
  t,
}: {
  message: MessageDTO | null;
  conversations: ConversationDTO[];
  onClose: () => void;
  onPick: (conversation: ConversationDTO) => Promise<void>;
  t: (key: never) => string;
}) {
  return (
    <Modal open={Boolean(message)} onClose={onClose} title={t("forwardTo" as never)}>
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {conversations.length === 0 && (
          <p className="text-sm text-[var(--muted)]">{t("noChats" as never)}</p>
        )}
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            onClick={() => void onPick(conversation)}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start hover:bg-[var(--surface-2)]"
          >
            <Avatar name={conversation.name} src={conversation.avatarUrl} size={36} />
            <span className="min-w-0 flex-1 truncate text-sm">{conversation.name}</span>
            <Icon name="forward" className="h-4 w-4 text-[var(--muted)]" />
          </button>
        ))}
      </div>
    </Modal>
  );
}

function GroupInfoDialog({
  open,
  onClose,
  conversation,
  t,
}: {
  open: boolean;
  onClose: () => void;
  conversation: ConversationDTO | null;
  t: (key: never) => string;
}) {
  const { addMember, removeMember, updateGroup, leaveConversation, blockUser, unblockUser, reportUser, showToast } =
    useMessenger();
  const [newMember, setNewMember] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("spam");

  if (!conversation) return null;
  const isGroup = conversation.type === "group";
  const isAdmin = conversation.role === "admin";

  return (
    <Modal open={open} onClose={onClose} title={isGroup ? t("groupInfo" as never) : t("profile" as never)}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={conversation.name} src={conversation.avatarUrl} size={56} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{conversation.name}</p>
            <p className="text-xs text-[var(--muted)]">
              {isGroup
                ? `${conversation.memberCount} ${t("members" as never)}`
                : conversation.peer?.publicId}
            </p>
            {!isGroup && conversation.peer?.about && (
              <p className="mt-1 text-xs text-[var(--muted)]">{conversation.peer.about}</p>
            )}
          </div>
        </div>

        {isGroup && (
          <>
            {isAdmin && (
              <div className="space-y-2">
                <Field label={t("groupName" as never)}>
                  <input
                    defaultValue={conversation.name}
                    onBlur={(event) => {
                      if (event.target.value.trim().length >= 2) {
                        void updateGroup(conversation.id, { name: event.target.value.trim() });
                      }
                    }}
                    className={inputClass}
                  />
                </Field>
                <Field label={t("groupDescription" as never)}>
                  <input
                    defaultValue={conversation.description}
                    onBlur={(event) =>
                      void updateGroup(conversation.id, { description: event.target.value })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label={t("adminsOnly" as never)}>
                  <select
                    value={conversation.sendPermission}
                    onChange={(event) =>
                      void updateGroup(conversation.id, { sendPermission: event.target.value })
                    }
                    className={inputClass}
                  >
                    <option value="all">{t("all" as never)}</option>
                    <option value="admins">{t("admin" as never)}</option>
                  </select>
                </Field>
                <div className="flex gap-2">
                  <input
                    value={newMember}
                    onChange={(event) => setNewMember(event.target.value.toUpperCase())}
                    placeholder={t("userId" as never)}
                    className={inputClass}
                  />
                  <button
                    onClick={async () => {
                      if (newMember.length < 6) return;
                      await addMember(conversation.id, newMember.trim());
                      setNewMember("");
                    }}
                    className={buttonGhost}
                  >
                    <Icon name="plus" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t("members" as never)}</p>
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {conversation.members.map((member) => (
                  <div key={member.id} className="flex items-center gap-2 rounded-lg px-1 py-1.5">
                    <Avatar name={member.displayName} src={member.avatarUrl} size={32} online={member.online} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{member.displayName}</p>
                      <p className="text-[11px] text-[var(--muted)]">
                        {member.publicId} · {member.role === "admin" ? t("admin" as never) : t("member" as never)}
                      </p>
                    </div>
                    {isAdmin && member.id !== conversation.members[0]?.id && (
                      <button
                        onClick={() => void removeMember(conversation.id, member.id)}
                        className="rounded-full p-1 text-[var(--muted)] hover:text-red-600"
                        title={t("removeMember" as never)}
                      >
                        <Icon name="close" className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={async () => {
                await leaveConversation(conversation.id);
                onClose();
              }}
              className={`${buttonGhost} w-full text-red-600`}
            >
              <Icon name="logout" className="h-4 w-4" />
              {t("leaveGroup" as never)}
            </button>
          </>
        )}

        {!isGroup && conversation.peer && (
          <div className="space-y-2">
            <button
              onClick={async () => {
                if (conversation.blocked) await unblockUser(conversation.peer!.publicId);
                else await blockUser(conversation.peer!.publicId);
                showToast(t("settingsSaved" as never));
              }}
              className={`${buttonGhost} w-full justify-start text-xs`}
            >
              <Icon name="lock" className="h-4 w-4" />
              {conversation.blocked ? t("unblock" as never) : t("block" as never)}
            </button>
            <button
              onClick={() => setReportOpen(true)}
              className={`${buttonGhost} w-full justify-start text-xs text-red-600`}
            >
              <Icon name="alert" className="h-4 w-4" />
              {t("report" as never)}
            </button>
            {reportOpen && (
              <div className="space-y-2 rounded-xl border border-[var(--border)] p-3">
                <Field label={t("reportReason" as never)}>
                  <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass}>
                    <option value="spam">spam</option>
                    <option value="harassment">harassment</option>
                    <option value="hate">hate</option>
                    <option value="other">other</option>
                  </select>
                </Field>
                <button
                  onClick={async () => {
                    await reportUser(conversation.peer!.publicId, reason, "");
                    setReportOpen(false);
                    showToast(t("settingsSaved" as never));
                  }}
                  className={`${buttonPrimary} w-full`}
                >
                  {t("report" as never)}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

void formatBytes;
