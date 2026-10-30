"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMessenger } from "@/components/MessengerProvider";
import { Avatar, Field, Icon, Modal, buttonGhost, buttonPrimary, inputClass } from "@/components/ui";
import { fileKindFromMime, timeAgo } from "@/lib/format";
import type { StatusDTO } from "@/lib/types";

const BACKGROUNDS = ["grad-1", "grad-2", "grad-3", "grad-4", "grad-5"];

const bgClass: Record<string, string> = {
  "grad-1": "bg-gradient-to-br from-teal-500 to-emerald-700",
  "grad-2": "bg-gradient-to-br from-indigo-500 to-purple-700",
  "grad-3": "bg-gradient-to-br from-amber-500 to-rose-600",
  "grad-4": "bg-gradient-to-br from-sky-500 to-blue-800",
  "grad-5": "bg-gradient-to-br from-slate-700 to-slate-900",
};

export function StatusPanel() {
  const { boot, t, locale, createStatus, viewStatus, upload, showToast } = useMessenger();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"text" | "image" | "video">("text");
  const [body, setBody] = useState("");
  const [background, setBackground] = useState("grad-1");
  const [audience, setAudience] = useState<"everyone" | "contacts">("everyone");
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<{ items: StatusDTO[]; index: number } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const statuses = boot?.statuses ?? [];
  const mine = useMemo(() => statuses.filter((s) => s.mine), [statuses]);
  const others = useMemo(() => {
    const map = new Map<number, { user: StatusDTO; items: StatusDTO[] }>();
    for (const status of statuses) {
      if (status.mine) continue;
      const entry = map.get(status.userId) ?? { user: status, items: [] };
      entry.items.push(status);
      map.set(status.userId, entry);
    }
    return [...map.values()];
  }, [statuses]);

  const openViewer = (items: StatusDTO[]) => {
    if (items.length === 0) return;
    setViewer({ items, index: 0 });
    viewStatus(items[0].id);
  };

  useEffect(() => {
    if (!viewer) return;
    const timer = setTimeout(() => {
      setViewer((current) => {
        if (!current) return null;
        if (current.index + 1 >= current.items.length) return null;
        const next = current.index + 1;
        viewStatus(current.items[next].id);
        return { ...current, index: next };
      });
    }, 5000);
    return () => clearTimeout(timer);
  }, [viewer, viewStatus]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{t("status")}</h1>
          <p className="text-xs text-[var(--muted)]">{t("statusHint")}</p>
        </div>
        <button onClick={() => setOpen(true)} className={buttonPrimary}>
          <Icon name="plus" className="h-4 w-4" />
          {t("addStatus")}
        </button>
      </header>

      <button
        onClick={() => (mine.length > 0 ? openViewer(mine) : setOpen(true))}
        className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-start"
      >
        <span className="relative">
          <Avatar name={boot?.me.displayName ?? ""} src={boot?.me.avatarUrl} size={52} />
          <span className="absolute -bottom-1 -end-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand)] text-white">
            <Icon name="plus" className="h-3 w-3" />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("myStatus")}</p>
          <p className="text-xs text-[var(--muted)]">
            {mine.length > 0
              ? `${mine.length} · ${mine[0].viewCount} ${t("views")}`
              : t("addStatus")}
          </p>
        </div>
        <Icon name="play" className="h-4 w-4 text-[var(--muted)]" />
      </button>

      <h2 className="mb-2 text-xs font-semibold text-[var(--muted)]">{t("recent")}</h2>
      {others.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
          {t("noStatus")}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {others.map(({ user, items }) => (
          <button
            key={user.id}
            onClick={() => openViewer(items)}
            className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-start transition hover:border-[var(--brand)]"
          >
            <span className="rounded-full bg-gradient-to-tr from-teal-500 to-emerald-700 p-[2px]">
              <span className="block rounded-full bg-[var(--surface)] p-[2px]">
                <Avatar name={user.userName} src={user.userAvatar} size={40} />
              </span>
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.userName}</p>
              <p className="text-[11px] text-[var(--muted)]">
                {items.length} · {timeAgo(items[0].createdAt, locale)}
              </p>
            </div>
          </button>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t("addStatus")}>
        <div className="space-y-3">
          <div className="flex gap-2">
            {(["text", "image", "video"] as const).map((option) => (
              <button
                key={option}
                onClick={() => setKind(option)}
                className={`flex-1 rounded-xl px-3 py-2 text-xs font-medium ${
                  kind === option
                    ? "bg-[var(--brand)] text-white"
                    : "bg-[var(--surface-2)] text-[var(--muted)]"
                }`}
              >
                {option === "text" ? t("statusText") : option === "image" ? t("photo") : t("video")}
              </button>
            ))}
          </div>

          {kind === "text" ? (
            <>
              <div
                className={`flex min-h-32 items-center justify-center rounded-xl p-4 text-center text-lg font-semibold text-white ${bgClass[background]}`}
              >
                {body || t("statusText")}
              </div>
              <div className="flex gap-2">
                {BACKGROUNDS.map((bg) => (
                  <button
                    key={bg}
                    onClick={() => setBackground(bg)}
                    className={`h-8 w-8 rounded-full ${bgClass[bg]} ${
                      background === bg ? "ring-2 ring-[var(--brand)] ring-offset-2" : ""
                    }`}
                  />
                ))}
              </div>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={t("statusText")}
                className={`${inputClass} min-h-20`}
              />
            </>
          ) : (
            <>
              <input
                ref={fileInput}
                type="file"
                accept={kind === "image" ? "image/*" : "video/*"}
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  try {
                    const media = await upload(file, fileKindFromMime(file.type));
                    setMediaId(media.id);
                  } catch {
                    showToast(t("uploadFailed"));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <button onClick={() => fileInput.current?.click()} className={`${buttonGhost} w-full`}>
                <Icon name="clip" className="h-4 w-4" />
                {mediaId ? "✓" : t("attach")}
              </button>
              <input
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={t("statusText")}
                className={inputClass}
              />
            </>
          )}

          <Field label={t("audience")}>
            <select
              value={audience}
              onChange={(event) => setAudience(event.target.value as "everyone" | "contacts")}
              className={inputClass}
            >
              <option value="everyone">{t("everyone")}</option>
              <option value="contacts">{t("contacts")}</option>
            </select>
          </Field>

          <button
            disabled={busy || (kind === "text" ? body.trim().length === 0 : !mediaId)}
            onClick={async () => {
              setBusy(true);
              try {
                await createStatus({ kind, body, mediaId, background, audience });
                setOpen(false);
                setBody("");
                setMediaId(null);
                showToast(t("statusPosted"));
              } catch {
                showToast(t("errorGeneric"));
              } finally {
                setBusy(false);
              }
            }}
            className={`${buttonPrimary} w-full`}
          >
            {t("send")}
          </button>
        </div>
      </Modal>

      {viewer && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
          <div className="flex gap-1 px-2 pt-2">
            {viewer.items.map((item, index) => (
              <span
                key={item.id}
                className="h-1 flex-1 overflow-hidden rounded-full bg-white/25"
              >
                <span
                  className={`block h-full bg-white transition-all ${
                    index < viewer.index ? "w-full" : index === viewer.index ? "w-1/2" : "w-0"
                  }`}
                />
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 px-4 py-3 text-white">
            <Avatar
              name={viewer.items[viewer.index].userName}
              src={viewer.items[viewer.index].userAvatar}
              size={36}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {viewer.items[viewer.index].userName}
              </p>
              <p className="text-[11px] text-white/70">
                {timeAgo(viewer.items[viewer.index].createdAt, locale)}
              </p>
            </div>
            <button onClick={() => setViewer(null)} className="rounded-full p-2">
              <Icon name="close" />
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center px-4 pb-10">
            {viewer.items[viewer.index].kind === "text" ? (
              <div
                className={`flex min-h-64 w-full max-w-md items-center justify-center rounded-2xl p-6 text-center text-2xl font-bold text-white ${
                  bgClass[viewer.items[viewer.index].background] ?? bgClass["grad-1"]
                }`}
              >
                {viewer.items[viewer.index].body}
              </div>
            ) : viewer.items[viewer.index].kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viewer.items[viewer.index].mediaUrl ?? ""}
                alt="status"
                className="max-h-full w-auto rounded-2xl object-contain"
              />
            ) : (
              <video
                src={viewer.items[viewer.index].mediaUrl ?? ""}
                controls
                autoPlay
                className="max-h-full w-auto rounded-2xl"
              />
            )}
            {viewer.items[viewer.index].mine && (
              <span className="absolute bottom-2 start-4 flex items-center gap-1 text-xs text-white/80">
                <Icon name="eye" className="h-4 w-4" />
                {viewer.items[viewer.index].viewCount} {t("views")}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
