export interface DesktopRuntimeState {
  connected?: boolean;
  runningThreadIds?: unknown;
}

export function applyDesktopRuntime<T extends { id: string; status: string }>(
  threads: readonly T[] | null | undefined,
  status: DesktopRuntimeState,
): T[] {
  const safeThreads = Array.isArray(threads) ? threads : [];
  if (!status.connected || !Array.isArray(status.runningThreadIds)) return [...safeThreads];
  const running = new Set(status.runningThreadIds.filter((id): id is string => typeof id === "string" && Boolean(id) && !id.startsWith("client-new-thread:")));
  return safeThreads.map((thread) => {
    if (running.has(thread.id)) return thread.status === "running" ? thread : { ...thread, status: "running" };
    return thread.status === "running" ? { ...thread, status: "interrupted" } : thread;
  }) as T[];
}
