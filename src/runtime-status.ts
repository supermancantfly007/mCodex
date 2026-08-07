import type { ThreadSummary } from "./types.js";

export interface DesktopRuntimeStatus {
  connected: boolean;
  runningThreadIds: string[];
}

export function reconcileRuntimeStatuses(threads: ThreadSummary[], runtime: DesktopRuntimeStatus): ThreadSummary[] {
  if (!runtime.connected) return threads;
  const running = new Set(runtime.runningThreadIds.filter((id) => typeof id === "string" && id.length > 0 && !id.startsWith("client-new-thread:")));
  return threads.map((thread) => {
    if (running.has(thread.id)) return thread.status === "running" ? thread : { ...thread, status: "running" };
    return thread.status === "running" ? { ...thread, status: "interrupted" } : thread;
  });
}
