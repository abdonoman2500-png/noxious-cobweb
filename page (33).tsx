import { cookies } from "next/headers";
import { AuthForm, AuthLayout } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default async function RecoverPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const store = await cookies();
  const locale = store.get("locale")?.value === "en" ? "en" : "ar";
  return (
    <AuthLayout locale={locale}>
      <AuthForm mode="recover" locale={locale} token={params.token} />
    </AuthLayout>
  );
}
