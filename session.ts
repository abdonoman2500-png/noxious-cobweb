import { cookies } from "next/headers";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { randomToken, sha256 } from "@/lib/utils";

export const SESSION_COOKIE = "sid";
const SESSION_DAYS = 30;

export type AuthUser = {
  id: number;
  publicId: string;
  email: string;
  displayName: string;
  about: string;
  avatarUrl: string | null;
  locale: string;
  theme: string;
  wallpaper: string;
  lastSeenVisibility: string;
  profileVisibility: string;
  readReceipts: boolean;
  pushEnabled: boolean;
  sessionId: number;
  deviceName: string;
};

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

export async function createSession(userId: number, deviceName: string, platform: string) {
  const token = randomToken(32);
  const tokenHash = sha256(token);
  const [row] = await db
    .insert(sessions)
    .values({ userId, tokenHash, deviceName, platform })
    .returning({ id: sessions.id });
  return { token, sessionId: row.id };
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = sha256(token);

  const rows = await db
    .select({
      session: sessions,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // Lightweight presence heartbeat (throttled to once per 30s).
  const lastSeen = row.user.lastSeenAt ? new Date(row.user.lastSeenAt).getTime() : 0;
  if (Date.now() - lastSeen > 30_000) {
    await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, row.user.id));
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, row.session.id));
  }

  return {
    id: row.user.id,
    publicId: row.user.publicId,
    email: row.user.email,
    displayName: row.user.displayName,
    about: row.user.about,
    avatarUrl: row.user.avatarUrl,
    locale: row.user.locale,
    theme: row.user.theme,
    wallpaper: row.user.wallpaper,
    lastSeenVisibility: row.user.lastSeenVisibility,
    profileVisibility: row.user.profileVisibility,
    readReceipts: row.user.readReceipts,
    pushEnabled: row.user.pushEnabled,
    sessionId: row.session.id,
    deviceName: row.session.deviceName,
  };
}

export async function requireAuthUser(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) throw new HttpError(401, "unauthorized");
  return user;
}

export async function revokeSession(sessionId: number, userId: number) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
}

export async function revokeAllOtherSessions(userId: number, keepSessionId: number) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        sql`${sessions.id} <> ${keepSessionId}`,
      ),
    );
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("[api]", error);
  return Response.json({ error: "server_error" }, { status: 500 });
}
