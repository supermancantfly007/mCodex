import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PushSubscription, RequestOptions, VapidKeys } from "web-push";
import { InvalidPushSubscriptionError, parsePushSubscription, TaskNotificationService, type PushTransport } from "./notifications.js";

const subscription = (endpoint = "https://push.example.test/device-1"): PushSubscription => ({
  endpoint,
  expirationTime: null,
  keys: { p256dh: "public_key-123", auth: "auth_key-456" },
});

class FakeTransport implements PushTransport {
  sent: Array<{ subscription: PushSubscription; payload: string; options: RequestOptions }> = [];
  errorByEndpoint = new Map<string, unknown>();

  generateVAPIDKeys(): VapidKeys {
    return { publicKey: "vapid_public-key", privateKey: "vapid_private-key" };
  }

  async sendNotification(target: PushSubscription, payload: string, options: RequestOptions): Promise<void> {
    this.sent.push({ subscription: target, payload, options });
    const error = this.errorByEndpoint.get(target.endpoint);
    if (error) throw error;
  }
}

describe("TaskNotificationService", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  async function service(transport = new FakeTransport()) {
    const directory = await mkdtemp(path.join(os.tmpdir(), "mcodex-push-"));
    tempDirs.push(directory);
    const stateFile = path.join(directory, "push-state.json");
    const instance = new TaskNotificationService(stateFile, "zh-CN", "mailto:test@example.com", transport);
    await instance.initialize();
    return { instance, stateFile, transport };
  }

  it("creates a private VAPID state file and reuses its public key", async () => {
    const { instance, stateFile, transport } = await service();
    expect(instance.publicConfig()).toMatchObject({ available: true, publicKey: "vapid_public-key", subscriptionCount: 0 });
    expect((await stat(stateFile)).mode & 0o777).toBe(0o600);

    await instance.subscribe(subscription());
    const restored = new TaskNotificationService(stateFile, "zh-CN", "mailto:test@example.com", transport);
    await restored.initialize();
    expect(restored.publicConfig()).toMatchObject({ publicKey: "vapid_public-key", subscriptionCount: 1 });
    expect(JSON.parse(await readFile(stateFile, "utf8"))).toMatchObject({ version: 1 });
  });

  it("validates, deduplicates, and removes browser subscriptions", async () => {
    expect(() => parsePushSubscription({ endpoint: "http://push.example.test", keys: {} })).toThrow(InvalidPushSubscriptionError);
    const { instance } = await service();
    await expect(instance.subscribe(subscription())).resolves.toEqual({ subscribed: true, created: true });
    await expect(instance.subscribe(subscription())).resolves.toEqual({ subscribed: true, created: false });
    expect(instance.publicConfig().subscriptionCount).toBe(1);
    await expect(instance.unsubscribe(subscription().endpoint)).resolves.toEqual({ subscribed: false, removed: true });
  });

  it("sends a private completion notification and removes expired endpoints", async () => {
    const transport = new FakeTransport();
    const { instance } = await service(transport);
    const active = subscription("https://push.example.test/active");
    const expired = subscription("https://push.example.test/expired");
    await instance.subscribe(active);
    await instance.subscribe(expired);
    transport.errorByEndpoint.set(expired.endpoint, { statusCode: 410 });

    await expect(instance.sendTaskCompleted("thread-id")).resolves.toEqual({ delivered: 1, failed: 1, removed: 1 });
    expect(instance.publicConfig().subscriptionCount).toBe(1);
    const payload = JSON.parse(transport.sent[0]?.payload ?? "{}");
    expect(payload).toMatchObject({ title: "Codex 任务已完成", body: "点击查看任务结果", data: { url: "/?thread=thread-id", threadId: "thread-id" } });
    expect(JSON.stringify(payload)).not.toContain("answer");
  });
});
