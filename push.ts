import webpush from "web-push";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, pushSubscriptions, users } from "@/db/schema";

const globalForPush = globalThis as typeof globalThis & {
  __vapidKeys?: { publicKey: string; privateKey: string } | null;
};

async function loadVapidKeys() {
  if (globalForPush.__vapidKeys) return globalForPush.__vapidKeys;
  try {
    const rows = await db
      .select()
      .from(appSettings)
      .where(sql`${appSettings.key} in ('vapid_public','vapid_private')`);
    const publicKey = rows.find((r) => r.key === "vapid_public")?.value;
    const privateKey = rows.find((r) => r.key === "vapid_private")?.value;
    if (publicKey && privateKey) {
      globalForPush.__vapidKeys = { publicKey, privateKey };
      return globalForPush.__vapidKeys;
    }
    const generated = webpush.generateVAPIDKeys();
    await db
      .insert(appSettings)
      .values([
        { key: "vapid_public", value: generated.publicKey },
        { key: "vapid_private", value: generated.privateKey },
      ])
      .onConflictDoNothing();
    globalForPush.__vapidKeys = generated;
    return generated;
  } catch (error) {
    console.error("[push] unable to load VAPID keys", error);
    return null;
  }
}

export async function getPublicKey(): Promise<string | null> {
  const keys = await loadVapidKeys();
  return keys?.publicKey ?? null;
}

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  conversationId?: number;
};

export async function sendPushToUser(userId: number, payload: PushPayload): Promise<number> {
  const keys = await loadVapidKeys();
  if (!keys) return 0;
  webpush.setVapidDetails("mailto:security@risala.app", keys.publicKey, keys.privateKey);

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  if (subs.length === 0) return 0;

  let delivered = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
          { TTL: 3600, urgency: "high" },
        );
        delivered += 1;
        await db
          .update(pushSubscriptions)
          .set({ lastUsedAt: new Date(), failureCount: 0 })
          .where(eq(pushSubscriptions.id, sub.id));
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        } else {
          await db
            .update(pushSubscriptions)
            .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
            .where(eq(pushSubscriptions.id, sub.id));
        }
      }
    }),
  );
  return delivered;
}

export async function pushEnabledFor(userId: number): Promise<boolean> {
  const rows = await db
    .select({ pushEnabled: users.pushEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.pushEnabled ?? false;
}
