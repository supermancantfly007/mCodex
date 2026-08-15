import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import webPush from "web-push";
import type { PushSubscription, RequestOptions, VapidKeys } from "web-push";

interface StoredPushSubscription extends PushSubscription {
  createdAt: string;
}

interface PushState {
  version: 1;
  vapid: VapidKeys;
  subscriptions: StoredPushSubscription[];
}

export interface PushTransport {
  generateVAPIDKeys(): VapidKeys;
  sendNotification(subscription: PushSubscription, payload: string, options: RequestOptions): Promise<unknown>;
}

export interface PushDeliveryResult {
  delivered: number;
  failed: number;
  removed: number;
}

const defaultTransport: PushTransport = {
  generateVAPIDKeys: () => webPush.generateVAPIDKeys(),
  sendNotification: (subscription, payload, options) => webPush.sendNotification(subscription, payload, options),
};

export class InvalidPushSubscriptionError extends Error {}

function isBase64Url(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && /^[A-Za-z0-9_-]+$/.test(value);
}

export function parsePushSubscription(value: unknown): PushSubscription {
  if (!value || typeof value !== "object") throw new InvalidPushSubscriptionError("Push subscription is invalid");
  const candidate = value as Record<string, unknown>;
  const endpoint = typeof candidate.endpoint === "string" ? candidate.endpoint.trim() : "";
  let parsedEndpoint: URL;
  try { parsedEndpoint = new URL(endpoint); } catch { throw new InvalidPushSubscriptionError("Push endpoint is invalid"); }
  if (parsedEndpoint.protocol !== "https:" || endpoint.length > 4_096) throw new InvalidPushSubscriptionError("Push endpoint must use HTTPS");
  const keys = candidate.keys && typeof candidate.keys === "object" ? candidate.keys as Record<string, unknown> : {};
  if (!isBase64Url(keys.p256dh, 1_024) || !isBase64Url(keys.auth, 256)) {
    throw new InvalidPushSubscriptionError("Push subscription keys are invalid");
  }
  const expirationTime = candidate.expirationTime;
  if (expirationTime != null && (typeof expirationTime !== "number" || !Number.isFinite(expirationTime))) {
    throw new InvalidPushSubscriptionError("Push subscription expiration is invalid");
  }
  return { endpoint, expirationTime: expirationTime == null ? null : expirationTime, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

function isStoredState(value: unknown): value is PushState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<PushState>;
  return state.version === 1
    && isBase64Url(state.vapid?.publicKey, 512)
    && isBase64Url(state.vapid?.privateKey, 512)
    && Array.isArray(state.subscriptions);
}

function pushStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  const value = Number((error as { statusCode?: unknown }).statusCode);
  return Number.isInteger(value) ? value : null;
}

function notificationPayload(title: string, body: string, threadId?: string): string {
  return JSON.stringify({
    title,
    body,
    icon: "/icons/mcodex-192.png",
    badge: "/icons/mcodex-96.png",
    tag: threadId ? `mcodex-complete-${threadId}` : "mcodex-test",
    data: { url: threadId ? `/?thread=${encodeURIComponent(threadId)}` : "/", threadId: threadId ?? null },
  });
}

export class TaskNotificationService {
  private state!: PushState;

  constructor(
    private readonly stateFile: string,
    private readonly locale: "zh-CN" | "en-US",
    private readonly subject: string,
    private readonly transport: PushTransport = defaultTransport,
  ) {}

  async initialize(): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.stateFile, "utf8"));
      if (!isStoredState(parsed)) throw new Error("invalid state structure");
      const subscriptions = parsed.subscriptions.flatMap((subscription) => {
        try {
          const normalized = parsePushSubscription(subscription);
          return [{ ...normalized, createdAt: typeof subscription.createdAt === "string" ? subscription.createdAt : new Date().toISOString() }];
        } catch { return []; }
      });
      this.state = { ...parsed, subscriptions };
      return;
    } catch (error) {
      if (error instanceof SyntaxError || (error instanceof Error && !((error as NodeJS.ErrnoException).code === "ENOENT"))) {
        console.warn("Web Push state could not be read; generating a new private state file.");
      }
    }
    this.state = { version: 1, vapid: this.transport.generateVAPIDKeys(), subscriptions: [] };
    await this.persist();
  }

  publicConfig(): { available: true; publicKey: string; subscriptionCount: number } {
    return { available: true, publicKey: this.state.vapid.publicKey, subscriptionCount: this.state.subscriptions.length };
  }

  async subscribe(value: unknown): Promise<{ subscribed: true; created: boolean }> {
    const subscription = parsePushSubscription(value);
    const existingIndex = this.state.subscriptions.findIndex((candidate) => candidate.endpoint === subscription.endpoint);
    const stored = { ...subscription, createdAt: new Date().toISOString() };
    if (existingIndex >= 0) this.state.subscriptions[existingIndex] = stored;
    else {
      if (this.state.subscriptions.length >= 20) this.state.subscriptions.shift();
      this.state.subscriptions.push(stored);
    }
    await this.persist();
    return { subscribed: true, created: existingIndex < 0 };
  }

  async unsubscribe(endpoint: unknown): Promise<{ subscribed: false; removed: boolean }> {
    if (typeof endpoint !== "string" || !endpoint.trim() || endpoint.length > 4_096) {
      throw new InvalidPushSubscriptionError("Push endpoint is invalid");
    }
    const previousLength = this.state.subscriptions.length;
    this.state.subscriptions = this.state.subscriptions.filter((candidate) => candidate.endpoint !== endpoint);
    const removed = this.state.subscriptions.length !== previousLength;
    if (removed) await this.persist();
    return { subscribed: false, removed };
  }

  async sendTaskCompleted(threadId: string): Promise<PushDeliveryResult> {
    const title = this.locale === "en-US" ? "Codex task completed" : "Codex 任务已完成";
    const body = this.locale === "en-US" ? "Tap to view the result" : "点击查看任务结果";
    return this.send(notificationPayload(title, body, threadId));
  }

  async sendTest(endpoint: unknown): Promise<PushDeliveryResult> {
    if (typeof endpoint !== "string") throw new InvalidPushSubscriptionError("Push endpoint is invalid");
    const subscription = this.state.subscriptions.find((candidate) => candidate.endpoint === endpoint);
    if (!subscription) throw new InvalidPushSubscriptionError("Push subscription was not found");
    const title = this.locale === "en-US" ? "mCodex notifications are ready" : "mCodex 通知已开启";
    const body = this.locale === "en-US" ? "You will be notified when a Codex task completes" : "Codex 任务完成后会在这里提醒你";
    return this.send(notificationPayload(title, body), [subscription]);
  }

  private async send(payload: string, targets = this.state.subscriptions): Promise<PushDeliveryResult> {
    if (!targets.length) return { delivered: 0, failed: 0, removed: 0 };
    let delivered = 0;
    let failed = 0;
    const expiredEndpoints = new Set<string>();
    await Promise.all(targets.map(async (subscription) => {
      try {
        await this.transport.sendNotification(subscription, payload, {
          TTL: 300,
          urgency: "normal",
          timeout: 10_000,
          vapidDetails: { subject: this.subject, publicKey: this.state.vapid.publicKey, privateKey: this.state.vapid.privateKey },
        });
        delivered += 1;
      } catch (error) {
        const statusCode = pushStatusCode(error);
        if (statusCode === 404 || statusCode === 410) expiredEndpoints.add(subscription.endpoint);
        else console.warn(`Web Push delivery failed${statusCode ? ` with status ${statusCode}` : ""}.`);
        failed += 1;
      }
    }));
    if (expiredEndpoints.size) {
      this.state.subscriptions = this.state.subscriptions.filter((subscription) => !expiredEndpoints.has(subscription.endpoint));
      await this.persist();
    }
    return { delivered, failed, removed: expiredEndpoints.size };
  }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(this.stateFile), { recursive: true });
    await writeFile(this.stateFile, `${JSON.stringify(this.state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(this.stateFile, 0o600);
  }
}
