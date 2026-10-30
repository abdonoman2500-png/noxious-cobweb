"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMessenger } from "@/components/MessengerProvider";
import {
  Avatar,
  Field,
  Icon,
  SectionCard,
  Toggle,
  buttonGhost,
  buttonPrimary,
  inputClass,
} from "@/components/ui";
import { apiFetch, del, post } from "@/lib/client";
import { formatBytes, timeAgo } from "@/lib/format";
import { pushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push-client";

type SessionRow = {
  id: number;
  deviceName: string;
  platform: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
};

type StorageRow = { totalBytes: number; totalCount: number };

const WALLPAPERS = [
  { id: "dusk", ar: "غروب", en: "Dusk" },
  { id: "sand", ar: "رمال", en: "Sand" },
  { id: "mint", ar: "نعناع", en: "Mint" },
  { id: "plain", ar: "سادة", en: "Plain" },
];

export function SettingsPanel() {
  const { boot, t, locale, updateSettings, showToast, refresh, blockUser, unblockUser } =
    useMessenger();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [about, setAbout] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [storage, setStorage] = useState<StorageRow | null>(null);
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "" });
  const [pushState, setPushState] = useState<"unknown" | "on" | "off" | "unsupported">("unknown");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (boot) {
      setDisplayName(boot.me.displayName);
      setAbout(boot.me.about);
      setPushState(pushSupported() ? "off" : "unsupported");
    }
  }, [boot]);

  const loadSessions = useCallback(async () => {
    try {
      const data = await apiFetch<{ sessions: SessionRow[] }>("/api/auth/sessions");
      setSessions(data.sessions);
    } catch {
      setSessions([]);
    }
  }, []);

  const loadStorage = useCallback(async () => {
    try {
      const data = await apiFetch<StorageRow>("/api/storage");
      setStorage(data);
    } catch {
      setStorage(null);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
    void loadStorage();
  }, [loadSessions, loadStorage]);

  if (!boot) return null;
  const me = boot.me;

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await updateSettings({ displayName, about });
      showToast(t("settingsSaved"));
    } catch {
      showToast(t("errorGeneric"));
    } finally {
      setSavingProfile(false);
    }
  };

  const enablePush = async () => {
    if (!boot.vapidPublicKey) {
      showToast(t("pushUnsupported"));
      return;
    }
    setBusy(true);
    try {
      const subscription = await subscribeToPush(boot.vapidPublicKey);
      if (!subscription) {
        setPushState("off");
        return;
      }
      await post("/api/push/subscribe", subscription.toJSON());
      setPushState("on");
      showToast(t("notificationsOn"));
    } catch {
      setPushState("off");
      showToast(t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    try {
      const endpoint = await unsubscribeFromPush();
      if (endpoint) await del(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`);
      setPushState("off");
      showToast(t("notificationsOff"));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await post("/api/auth/logout", {});
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5">
      <header className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <Avatar name={me.displayName} src={me.avatarUrl} size={64} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{me.displayName}</p>
          <button
            onClick={async () => {
              await navigator.clipboard?.writeText(me.publicId);
              showToast(t("copied"));
            }}
            className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--brand)]"
          >
            {me.publicId}
            <Icon name="copy" className="h-3.5 w-3.5" />
          </button>
          <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{me.email}</p>
        </div>
      </header>

      <SectionCard title={t("profile")} icon="user">
        <div className="space-y-3">
          <Field label={t("displayName")}>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("about")}>
            <input value={about} onChange={(event) => setAbout(event.target.value)} className={inputClass} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void saveProfile()} disabled={savingProfile} className={buttonPrimary}>
              {t("save")}
            </button>
            <label className={`${buttonGhost} cursor-pointer`}>
              <Icon name="image" className="h-4 w-4" />
              {t("photo")}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const form = new FormData();
                  form.append("file", file);
                  form.append("kind", "image");
                  try {
                    const data = await apiFetch<{ media: { url: string } }>("/api/media", {
                      method: "POST",
                      body: form,
                    });
                    await updateSettings({ avatarUrl: data.media.url });
                    showToast(t("settingsSaved"));
                  } catch {
                    showToast(t("uploadFailed"));
                  }
                }}
              />
            </label>
          </div>
          <p className="text-[11px] text-[var(--muted)]">{t("userIdHint")}</p>
        </div>
      </SectionCard>

      <SectionCard title={t("account")} icon="lock">
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t("currentPassword")}>
              <input
                type="password"
                value={passwordForm.current}
                onChange={(event) =>
                  setPasswordForm({ ...passwordForm, current: event.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label={t("newPassword")}>
              <input
                type="password"
                value={passwordForm.next}
                onChange={(event) => setPasswordForm({ ...passwordForm, next: event.target.value })}
                className={inputClass}
              />
            </Field>
          </div>
          <button
            onClick={async () => {
              try {
                await post("/api/auth/password", {
                  currentPassword: passwordForm.current,
                  newPassword: passwordForm.next,
                });
                setPasswordForm({ current: "", next: "" });
                showToast(t("passwordChanged"));
              } catch {
                showToast(t("wrongPassword"));
              }
            }}
            className={buttonGhost}
          >
            {t("updatePassword")}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title={t("sessions")}
        icon="shield"
        action={
          <button
            onClick={async () => {
              await del("/api/auth/sessions");
              await loadSessions();
            }}
            className="text-xs font-medium text-red-600"
          >
            {t("revokeOthers")}
          </button>
        }
      >
        <div className="space-y-1">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {session.deviceName} {session.current && <span className="text-[var(--brand)]">· {t("currentDevice")}</span>}
                </p>
                <p className="text-[var(--muted)]">
                  {t("lastSeen")} {timeAgo(session.lastSeenAt, locale)}
                </p>
              </div>
              {!session.current && (
                <button
                  onClick={async () => {
                    await del(`/api/auth/sessions?id=${session.id}`);
                    await loadSessions();
                  }}
                  className="rounded-full p-1 text-[var(--muted)] hover:text-red-600"
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t("privacy")} icon="shield">
        <div className="space-y-3">
          <Field label={t("lastSeenVisibility")}>
            <select
              value={me.lastSeenVisibility}
              onChange={(event) => void updateSettings({ lastSeenVisibility: event.target.value })}
              className={inputClass}
            >
              <option value="everyone">{t("everyone")}</option>
              <option value="contacts">{t("contacts")}</option>
              <option value="nobody">{t("nobody" as never)}</option>
            </select>
          </Field>
          <Field label={t("profileVisibility")}>
            <select
              value={me.profileVisibility}
              onChange={(event) => void updateSettings({ profileVisibility: event.target.value })}
              className={inputClass}
            >
              <option value="everyone">{t("everyone")}</option>
              <option value="contacts">{t("contacts")}</option>
              <option value="nobody">{t("nobody" as never)}</option>
            </select>
          </Field>
          <Toggle
            checked={me.readReceipts}
            onChange={(value) => void updateSettings({ readReceipts: value })}
            label={t("readReceipts")}
          />
        </div>
      </SectionCard>

      <SectionCard title={t("notifications")} icon="bell">
        <div className="space-y-2">
          <Toggle
            checked={me.pushEnabled}
            onChange={(value) => void updateSettings({ pushEnabled: value })}
            label={t("pushEnabled")}
          />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button onClick={() => void enablePush()} disabled={busy} className={buttonPrimary}>
              <Icon name="bell" className="h-4 w-4" />
              {t("enableNotifications")}
            </button>
            <button onClick={() => void disablePush()} disabled={busy} className={buttonGhost}>
              {t("notificationsOff")}
            </button>
            <span className="text-[11px] text-[var(--muted)]">
              {pushState === "on"
                ? t("notificationsOn")
                : pushState === "unsupported"
                  ? t("pushUnsupported")
                  : t("notificationsOff")}
            </span>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t("appearance")} icon="palette">
        <div className="space-y-3">
          <div className="flex gap-2">
            {(["light", "dark"] as const).map((theme) => (
              <button
                key={theme}
                onClick={() => void updateSettings({ theme })}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                  me.theme === theme
                    ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                    : "border-[var(--border)]"
                }`}
              >
                <Icon name={theme === "light" ? "sun" : "moon"} className="h-4 w-4" />
                {theme === "light" ? t("light") : t("dark")}
              </button>
            ))}
          </div>
          <Field label={t("language")}>
            <select
              value={me.locale}
              onChange={(event) => {
                void updateSettings({ locale: event.target.value });
                setTimeout(() => router.refresh(), 250);
              }}
              className={inputClass}
            >
              <option value="ar">العربية (RTL)</option>
              <option value="en">English (LTR)</option>
            </select>
          </Field>
          <Field label={t("wallpaper")}>
            <div className="flex flex-wrap gap-2">
              {WALLPAPERS.map((wallpaper) => (
                <button
                  key={wallpaper.id}
                  onClick={() => void updateSettings({ wallpaper: wallpaper.id })}
                  className={`rounded-xl border px-3 py-2 text-xs ${
                    me.wallpaper === wallpaper.id
                      ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                      : "border-[var(--border)]"
                  }`}
                >
                  {locale === "ar" ? wallpaper.ar : wallpaper.en}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title={t("storage")} icon="database">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-[var(--muted)]">{t("storageUsed")}</span>
            <span className="font-semibold">{storage ? formatBytes(storage.totalBytes) : "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--muted)]">{t("mediaCount")}</span>
            <span className="font-semibold">{storage?.totalCount ?? 0}</span>
          </div>
          <p className="text-[11px] text-[var(--muted)]">{t("storageHint")}</p>
          <button
            onClick={async () => {
              if ("caches" in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map((key) => caches.delete(key)));
              }
              showToast(t("cacheCleared"));
            }}
            className={buttonGhost}
          >
            {t("clearCache")}
          </button>
        </div>
      </SectionCard>

      <SectionCard title={t("blocked")} icon="lock">
        {boot.blocked.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">{t("noBlocked")}</p>
        ) : (
          <div className="space-y-1">
            {boot.blocked.map((user) => (
              <div key={user.id} className="flex items-center gap-2 rounded-lg px-1 py-1.5">
                <Avatar name={user.displayName} src={user.avatarUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{user.displayName}</p>
                  <p className="text-[11px] text-[var(--muted)]">{user.publicId}</p>
                </div>
                <button
                  onClick={async () => {
                    await unblockUser(user.publicId);
                    showToast(t("settingsSaved"));
                  }}
                  className="text-xs font-medium text-[var(--brand)]"
                >
                  {t("unblock")}
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-[var(--muted)]">{t("blockedHint")}</p>
        <button
          onClick={async () => {
            const id = window.prompt(t("enterId"));
            if (id) await blockUser(id.trim().toUpperCase());
            void refresh();
          }}
          className={`${buttonGhost} mt-2 w-full text-xs`}
        >
          <Icon name="lock" className="h-4 w-4" />
          {t("block")}
        </button>
      </SectionCard>

      <SectionCard title={t("dangerZone")} icon="alert">
        <button onClick={() => void logout()} className={`${buttonGhost} w-full text-red-600`}>
          <Icon name="logout" className="h-4 w-4" />
          {t("logout")}
        </button>
      </SectionCard>

      <p className="pb-6 text-center text-[11px] text-[var(--muted)]">
        {t("appName")} · {t("tagline")}
      </p>
    </div>
  );
}
