const DEFAULT_ICON = "/icons/mcodex-192.png";
const DEFAULT_BADGE = "/icons/mcodex-96.png";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch { /* Use the private fallback below. */ }
  const title = typeof payload.title === "string" ? payload.title : "Codex 任务已完成";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "点击查看任务结果",
    icon: typeof payload.icon === "string" ? payload.icon : DEFAULT_ICON,
    badge: typeof payload.badge === "string" ? payload.badge : DEFAULT_BADGE,
    tag: typeof payload.tag === "string" ? payload.tag : "mcodex-task-complete",
    data: payload.data && typeof payload.data === "object" ? payload.data : { url: "/" },
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data && typeof event.notification.data === "object" ? event.notification.data : {};
  const targetUrl = new URL(typeof data.url === "string" ? data.url : "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      existing.postMessage({ type: "mcodex:open-thread", threadId: typeof data.threadId === "string" ? data.threadId : null });
      await existing.focus();
      return;
    }
    await self.clients.openWindow(targetUrl);
  })());
});
