import Link from "next/link";
import { cookies } from "next/headers";
import { getAuthUser } from "@/lib/session";
import { makeT } from "@/lib/i18n";
import { Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const store = await cookies();
  const locale = store.get("locale")?.value === "en" ? "en" : "ar";
  const t = makeT(locale);
  const user = await getAuthUser();

  const features = [
    { icon: "chat" as const, title: t("featureRealtime"), body: locale === "ar" ? "تسليم فوري مع إشعارات القراءة" : "Instant delivery with read receipts" },
    { icon: "phone" as const, title: t("featureCalls"), body: locale === "ar" ? "WebRTC عبر الشبكات المختلفة" : "WebRTC across networks" },
    { icon: "shield" as const, title: t("featurePrivate"), body: locale === "ar" ? "جلسات آمنة وحظر وإبلاغ" : "Secure sessions, blocking and reporting" },
    { icon: "download" as const, title: t("featurePwa"), body: locale === "ar" ? "تثبيت على iOS و أندرويد" : "Installable on iOS and Android" },
  ];

  return (
    <div className="min-h-[100dvh] bg-[var(--bg)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white">
            <Icon name="chat" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold leading-tight">{t("appName")}</p>
            <p className="text-[10px] text-[var(--muted)]">{t("tagline")}</p>
          </div>
        </div>
        <nav className="flex items-center gap-2 text-xs">
          <a
            href={locale === "ar" ? "/api/locale?set=en" : "/api/locale?set=ar"}
            className="rounded-full px-2 py-1 text-[var(--muted)]"
            title={locale === "ar" ? "English" : "العربية"}
          >
            <Icon name="globe" className="inline h-4 w-4" />
          </a>
          <Link
            href="/login"
            className="rounded-full border border-[var(--border)] px-3 py-1.5 font-medium"
          >
            {t("login")}
          </Link>
          <Link href="/register" className="brand-gradient rounded-full px-3 py-1.5 font-medium text-white">
            {t("register")}
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-16">
        <section className="grid items-center gap-8 py-10 md:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--brand)]">
              <Icon name="shield" className="h-3.5 w-3.5" />
              {locale === "ar" ? "هوية رقمية مستقلة" : "Independent digital identity"}
            </span>
            <h1 className="mt-4 text-3xl font-extrabold leading-tight sm:text-4xl">{t("heroTitle")}</h1>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--muted)]">{t("heroSubtitle")}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                href={user ? "/app" : "/register"}
                className="brand-gradient inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-lg"
              >
                {user ? t("enterApp") : t("getStarted")}
                <Icon name="send" className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-5 py-3 text-sm font-medium"
              >
                {t("seeDemo")}
              </Link>
            </div>
            <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--muted)]">
              <p className="font-semibold text-[var(--text)]">
                {locale === "ar" ? "حسابان تجريبيان" : "Demo accounts"}
              </p>
              <p className="mt-1 font-mono">demo1@example.com · demo2@example.com</p>
              <p className="font-mono">{locale === "ar" ? "كلمة المرور" : "password"}: Demo12345</p>
            </div>
          </div>

          <div className="relative">
            <div className="brand-gradient rounded-3xl p-5 text-white shadow-2xl">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                  <Icon name="user" className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">K7M2QX9P</p>
                  <p className="text-[11px] text-white/70">{locale === "ar" ? "متصل الآن" : "online"}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="max-w-[85%] rounded-2xl rounded-ss-sm bg-white/15 px-3 py-2 text-xs">
                  {locale === "ar" ? "مرحباً! وصلت رسالتك 👋" : "Hey! Your message arrived 👋"}
                </div>
                <div className="ms-auto max-w-[85%] rounded-2xl rounded-se-sm bg-white px-3 py-2 text-xs text-slate-900">
                  {locale === "ar" ? "ممتاز، هل نبدأ مكالمة فيديو؟" : "Great, shall we start a video call?"}
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-ss-sm bg-white/15 px-3 py-2 text-xs">
                  {locale === "ar" ? "بالتأكيد 📹" : "Absolutely 📹"}
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-full bg-white/15 px-3 py-2 text-[11px]">
                <Icon name="mic" className="h-4 w-4" />
                {locale === "ar" ? "رسالة صوتية ٠:١٢" : "Voice message 0:12"}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
                <Icon name={feature.icon} className="h-4.5 w-4.5" />
              </span>
              <p className="mt-3 text-sm font-semibold">{feature.title}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{feature.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-[var(--border)] py-4 text-center text-[11px] text-[var(--muted)]">
        {t("footerNote")}
      </footer>
    </div>
  );
}
