import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/session";
import { AuthForm, AuthLayout } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const user = await getAuthUser();
  if (user) redirect("/app");
  const store = await cookies();
  const locale = store.get("locale")?.value === "en" ? "en" : "ar";
  return (
    <AuthLayout locale={locale}>
      <AuthForm mode="register" locale={locale} />
    </AuthLayout>
  );
}
