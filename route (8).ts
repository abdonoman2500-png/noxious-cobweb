import { NextResponse } from "next/server";
import { getAuthUser, revokeSession, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (user) {
    await revokeSession(user.sessionId, user.id);
    const body = (await request.json().catch(() => ({}))) as { all?: boolean };
    if (body.all) {
      const { revokeAllOtherSessions } = await import("@/lib/session");
      await revokeAllOtherSessions(user.id, user.sessionId);
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
