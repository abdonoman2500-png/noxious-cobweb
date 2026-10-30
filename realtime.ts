/**
 * In-process pub/sub used by the SSE stream. Because the app runs as a single
 * Node server (`next start`) this gives instant delivery; clients additionally
 * poll `/api/pulse` so a dropped stream never loses data.
 */
export type RealtimeEvent = {
  type: string;
  userId?: number;
  conversationId?: number;
  payload?: unknown;
};

type Subscriber = (event: RealtimeEvent) => void;

const globalForBus = globalThis as typeof globalThis & {
  __realtimeSubscribers?: Map<number, Set<Subscriber>>;
};

const subscribers = (globalForBus.__realtimeSubscribers ??= new Map<number, Set<Subscriber>>());

export function subscribe(userId: number, handler: Subscriber): () => void {
  const set = subscribers.get(userId) ?? new Set<Subscriber>();
  set.add(handler);
  subscribers.set(userId, set);
  return () => {
    const current = subscribers.get(userId);
    if (!current) return;
    current.delete(handler);
    if (current.size === 0) subscribers.delete(userId);
  };
}

export function publish(event: RealtimeEvent) {
  if (event.userId === undefined) return;
  const set = subscribers.get(event.userId);
  if (!set) return;
  for (const handler of set) {
    try {
      handler(event);
    } catch {
      // A broken stream must never break the request that published the event.
    }
  }
}

export function publishToUsers(userIds: number[], event: Omit<RealtimeEvent, "userId">) {
  for (const userId of new Set(userIds)) publish({ ...event, userId });
}

export function subscriberCount(userId: number): number {
  return subscribers.get(userId)?.size ?? 0;
}
