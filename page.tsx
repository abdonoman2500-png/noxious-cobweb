import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/session";
import { MessengerProvider } from "@/components/MessengerProvider";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  return (
    <MessengerProvider>
      <AppShell />
    </MessengerProvider>
  );
}
