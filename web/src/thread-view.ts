export const selectedThreadStorageKey = "mcodex.selectedThreadId";

export function normalizeStoredThreadId(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized && normalized.length <= 200 ? normalized : null;
}

export function resolveStoredThreadId<T extends { id: string }>(storedId: string | null, threads: readonly T[]): string | null {
  const normalized = normalizeStoredThreadId(storedId);
  return normalized && threads.some((thread) => thread.id === normalized) ? normalized : null;
}

export interface TimelineScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

export function shouldShowJumpToLatest(metrics: TimelineScrollMetrics, threshold = 120): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight > threshold;
}
