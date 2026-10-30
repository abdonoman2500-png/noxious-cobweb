"use client";

import { useEffect } from "react";
import { useMessenger, type Tab } from "@/components/MessengerProvider";
import { ChatPanel } from "@/components/ChatPanel";
import { GroupsPanel } from "@/components/GroupsPanel";
import { StatusPanel } from "@/components/StatusPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { CallOverlay } from "@/components/CallOverlay";
import { PwaRegister } from "@/components/PwaRegister";
import { Icon, type IconName } from "@/components/ui";

const TABS: { id: Tab; icon: IconName }[] = [
  { id: "chats", icon: "chat" },
  { id: "groups", icon: "group" },
  { id: "status", icon: "status" },
  { id: "settings", icon: "settings" },
];

export function AppShell() {
  const { boot, t, tab, setTab, toast, call, refresh } = useMessenger();

  useEffect(() => {
    document.documentElement.dataset.theme = boot?.me.theme ?? "light";
    document.documentElement.lang = boot?.me.locale ?? "ar";
    document.documentElement.dir = boot?.me.locale === "en" ? "ltr" : "rtl";
  }, [boot?.me.theme, boot?.me.locale]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const unread = (boot?.conversations ?? []).reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[var(--bg)]">
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-hidden">
          {tab === "chats" && <ChatPanel />}
          {tab === "groups" && (
            <div className="h-full overflow-y-auto">
              <GroupsPanel />
            </div>
          )}
          {tab === "status" && (
            <div className="h-full overflow-y-auto">
              <StatusPanel />
            </div>
          )}
          {tab === "settings" && (
            <div className="h-full overflow-y-auto">
              <SettingsPanel />
            </div>
          )}
        </main>
      </div>

      <nav className="safe-bottom flex items-stretch justify-around border-t border-[var(--border)] bg-[var(--surface)] md:hidden">
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`relative flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition ${
              tab === item.id ? "text-[var(--brand)]" : "text-[var(--muted)]"
            }`}
          >
            <Icon name={item.icon} className="h-5 w-5" />
            {t(item.id)}
            {item.id === "chats" && unread > 0 && (
              <span className="absolute end-1/4 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {unread}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="hidden items-center gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-1.5 md:flex">
        <span className="text-[11px] font-semibold text-[var(--brand)]">{t("appName")}</span>
        <span className="text-[11px] text-[var(--muted)]">· {t("tagline")}</span>
        <div className="ms-auto flex items-center gap-2">
          <PwaRegister label={t("install")} />
        </div>
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-24 start-1/2 z-[70] -translate-x-1/2 rounded-full bg-slate-900/95 px-4 py-2 text-xs font-medium text-white shadow-lg md:bottom-16">
          {toast}
        </div>
      )}

      {call && <CallOverlay />}
    </div>
  );
}
