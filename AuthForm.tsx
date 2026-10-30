"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, errorMessage, post } from "@/lib/client";
import { makeT } from "@/lib/i18n";
import type { Locale } from "@/lib/types";
import { buttonGhost, buttonPrimary, Field, Icon, inputClass } from "@/components/ui";

type Mode = "login" | "register" | "recover";

export function AuthForm({
  mode,
  locale,
  token,
}: {
  mode: Mode;
  locale: Locale;
  token?: string;
}) {
  const t = makeT(locale);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await post("/api/auth/login", { email, password });
        router.push("/app");
        router.refresh();
        return;
      }
      if (mode === "register") {
        if (password !== confirm) {
          setError(locale === "ar" ? "كلمتا المرور غير متطابقتين" : "Passwords do not match");
          return;
        }
        await post("/api/auth/register", { email, password, displayName, locale });
        router.push("/app");
        router.refresh();
        return;
      }
      if (token) {
        if (password !== confirm) {
          setError(locale === "ar" ? "كلمتا المرور غير متطابقتين" : "Passwords do not match");
          return;
        }
        await post("/api/auth/password", { token, newPassword: password });
        setInfo(t("resetDone"));
        setTimeout(() => router.push("/login"), 1200);
        return;
      }
      const data = await post<{ resetUrl?: string | null }>("/api/auth/recover", { email });
      setInfo(t("recoverSent"));
      if (data.resetUrl) setResetUrl(data.resetUrl);
    } catch (caught) {
      const code = (caught as { code?: string }).code ?? "error";
      setError(errorMessage(code, t as never));
    } finally {
      setBusy(false);
    }
  };

  const title = token ? t("resetTitle") : mode === "login" ? t("login") : mode === "register" ? t("register") : t("recover");

  return (
    <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
      <div className="mb-5 flex items-center gap-3">
        <span className="brand-gradient flex h-11 w-11 items-center justify-center rounded-2xl text-white">
          <Icon name="chat" className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-lg font-bold">{title}</h1>
          <p className="text-xs text-[var(--muted)]">{t("tagline")}</p>
        </div>
      </div>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {mode === "register" && (
          <Field label={t("displayName")}>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className={inputClass}
              autoComplete="name"
              required
            />
          </Field>
        )}
        <Field label={t("email")}>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass}
            autoComplete="email"
            required
          />
        </Field>
        {mode !== "recover" || token ? (
          <>
            <Field label={token ? t("newPassword") : t("password")}>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={inputClass}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
            </Field>
            {(mode === "register" || token) && (
              <Field label={t("newPassword")}>
                <input
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  className={inputClass}
                  autoComplete="new-password"
                  required
                />
              </Field>
            )}
          </>
        ) : null}

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600">{error}</p>
        )}
        {info && (
          <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">{info}</p>
        )}
        {resetUrl && (
          <a
            href={resetUrl}
            className="block truncate rounded-lg bg-[var(--brand-soft)] px-3 py-2 text-xs font-medium text-[var(--brand)]"
          >
            {resetUrl}
          </a>
        )}

        <button type="submit" disabled={busy} className={`${buttonPrimary} w-full`}>
          {busy ? t("loading") : title}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
        {mode === "login" && (
          <>
            <Link href="/recover" className="text-[var(--brand)] hover:underline">
              {t("forgot")}
            </Link>
            <Link href="/register" className="text-[var(--muted)] hover:underline">
              {t("noAccount")} {t("register")}
            </Link>
          </>
        )}
        {mode === "register" && (
          <Link href="/login" className="text-[var(--muted)] hover:underline">
            {t("hasAccount")} {t("login")}
          </Link>
        )}
        {mode === "recover" && (
          <Link href="/login" className={buttonGhost}>
            <Icon name="back" className="h-4 w-4" />
            {t("login")}
          </Link>
        )}
      </div>

      {mode === "register" && (
        <p className="mt-4 rounded-xl bg-[var(--surface-2)] p-3 text-[11px] leading-relaxed text-[var(--muted)]">
          {locale === "ar"
            ? "بعد التسجيل ستحصل على معرّف رقمي فريد من ٨ خانات (مثل K7M2QX9P) يمكنك مشاركته مع الآخرين لبدء المحادثات. لا نستخدم رقم الهاتف."
            : "After signing up you receive a unique 8-character ID (e.g. K7M2QX9P) to share with others. No phone number required."}
        </p>
      )}
      {mode === "login" && (
        <p className="mt-4 rounded-xl bg-[var(--surface-2)] p-3 text-[11px] leading-relaxed text-[var(--muted)]">
          {locale === "ar"
            ? "حسابان تجريبيان: demo1@example.com / demo2@example.com وكلمة المرور Demo12345"
            : "Demo accounts: demo1@example.com / demo2@example.com with password Demo12345"}
        </p>
      )}
    </div>
  );
}

export function AuthLayout({ children, locale }: { children: React.ReactNode; locale: Locale }) {
  const t = makeT(locale);
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-[var(--bg)] p-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="brand-gradient flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg">
          <Icon name="chat" className="h-7 w-7" />
        </span>
        <h1 className="text-2xl font-bold">{t("appName")}</h1>
        <p className="max-w-xs text-xs text-[var(--muted)]">{t("appDescription")}</p>
      </div>
      {children}
    </div>
  );
}

void apiFetch;
