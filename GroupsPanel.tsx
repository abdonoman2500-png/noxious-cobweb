"use client";

import { useMemo, useState } from "react";
import { useMessenger } from "@/components/MessengerProvider";
import { Avatar, Field, Icon, Modal, buttonGhost, buttonPrimary, inputClass } from "@/components/ui";
import { timeAgo } from "@/lib/format";

export function GroupsPanel() {
  const { boot, t, locale, openChat, setTab, createGroup } = useMessenger();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [entry, setEntry] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    const list = (boot?.conversations ?? []).filter((c) => c.type === "group");
    const q = query.trim().toLowerCase();
    return q ? list.filter((g) => g.name.toLowerCase().includes(q)) : list;
  }, [boot, query]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{t("groups")}</h1>
          <p className="text-xs text-[var(--muted)]">
            {groups.length} {t("group")}
          </p>
        </div>
        <button onClick={() => setOpen(true)} className={buttonPrimary}>
          <Icon name="plus" className="h-4 w-4" />
          {t("newGroup")}
        </button>
      </header>

      <div className="mb-3 flex items-center gap-2 rounded-xl bg-[var(--surface)] px-3 py-2">
        <Icon name="search" className="h-4 w-4 text-[var(--muted)]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("search")}
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      <div className="space-y-2">
        {groups.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
            <p className="text-sm font-medium">{t("noChats")}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{t("noChatsHint")}</p>
          </div>
        )}
        {groups.map((group) => (
          <button
            key={group.id}
            onClick={() => {
              openChat(group.id);
              setTab("chats");
            }}
            className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-start transition hover:border-[var(--brand)]"
          >
            <Avatar name={group.name} src={group.avatarUrl} size={48} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{group.name}</p>
              <p className="truncate text-xs text-[var(--muted)]">
                {group.memberCount} {t("members")}
                {group.lastMessage ? ` · ${group.lastMessage.body || group.lastMessage.kind}` : ""}
              </p>
            </div>
            <div className="text-end">
              <p className="text-[11px] text-[var(--muted)]">
                {group.lastMessage ? timeAgo(group.lastMessage.createdAt, locale) : ""}
              </p>
              {group.role === "admin" && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-[10px] font-semibold">
                  <Icon name="crown" className="h-3 w-3" />
                  {t("admin")}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t("newGroup")}>
        <div className="space-y-3">
          <Field label={t("groupName")}>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          <Field label={t("groupDescription")}>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("selectMembers")} hint={t("searchPlaceholder")}>
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
                await createGroup(name.trim(), ids);
                setOpen(false);
                setName("");
                setDescription("");
                setIds([]);
              } finally {
                setBusy(false);
              }
            }}
            className={`${buttonPrimary} w-full`}
          >
            {t("create")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
