import { EventEmitter } from "node:events";
import { open, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { BridgeEvent } from "../types.js";
import { isVisibleTimelineItem, parseJsonLine, rollbackTurnsFromRecord, statusFromEvent, timelineFromRecord } from "./parser.js";

interface Cursor { offset: number; pending: string }

export class SessionWatcher extends EventEmitter {
  private readonly cursors = new Map<string, Cursor>();
  private timer: NodeJS.Timeout | null = null;
  private scanning = false;

  constructor(private readonly codexHome: string, private readonly intervalMs: number) {
    super();
  }

  async start(): Promise<void> {
    await this.seed();
    this.timer = setInterval(() => void this.scan(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async files(): Promise<string[]> {
    const result: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
      await Promise.all(entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile() && entry.name.endsWith(".jsonl")) result.push(full);
      }));
    };
    await Promise.all([walk(path.join(this.codexHome, "sessions")), walk(path.join(this.codexHome, "archived_sessions"))]);
    return result;
  }

  private async seed(): Promise<void> {
    for (const filePath of await this.files()) {
      try {
        const fileStat = await stat(filePath);
        this.cursors.set(filePath, { offset: fileStat.size, pending: "" });
      } catch (error) {
        if (!this.isMissingFile(error)) throw error;
      }
    }
  }

  private async scan(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    try {
      for (const filePath of await this.files()) await this.readGrowth(filePath);
    } finally {
      this.scanning = false;
    }
  }

  private async readGrowth(filePath: string): Promise<void> {
    try {
      const fileStat = await stat(filePath);
      let cursor = this.cursors.get(filePath);
      if (!cursor) {
        // A file discovered after startup is a new task; emit its initial records
        // so connected clients do not miss the first user turn.
        cursor = { offset: 0, pending: "" };
        this.cursors.set(filePath, cursor);
      }
      if (fileStat.size < cursor.offset) cursor = { offset: 0, pending: "" };
      if (fileStat.size === cursor.offset) return;
      const startOffset = cursor.offset;
      const size = fileStat.size - startOffset;
      const handle = await open(filePath, "r");
      const buffer = Buffer.alloc(size);
      try { await handle.read(buffer, 0, size, startOffset); } finally { await handle.close(); }
      const combined = cursor.pending + buffer.toString("utf8");
      const lines = combined.split(/\r?\n/);
      cursor.pending = lines.pop() ?? "";
      cursor.offset = fileStat.size;
      this.cursors.set(filePath, cursor);
      const filenameId = path.basename(filePath).match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i)?.[0];
      if (!filenameId) return;
      let logicalOffset = startOffset;
      for (const line of lines) {
        const record = parseJsonLine(line);
        if (record) {
          const parsedItem = timelineFromRecord(record, filenameId, logicalOffset);
          const item = parsedItem && isVisibleTimelineItem(parsedItem) ? parsedItem : null;
          const eventType = record.type === "event_msg" ? String(record.payload?.type ?? "") : "";
          const status = statusFromEvent(eventType);
          const rollbackTurns = rollbackTurnsFromRecord(record);
          if (item || status || rollbackTurns) {
            const event: BridgeEvent = {
              id: `${filenameId}:${logicalOffset}`,
              threadId: filenameId,
              timestamp: typeof record.timestamp === "string" ? record.timestamp : new Date().toISOString(),
              item,
              status,
              rollbackTurns: rollbackTurns || undefined,
            };
            this.emit("event", event);
          }
        }
        logicalOffset += Buffer.byteLength(line, "utf8") + 1;
      }
    } catch (error) {
      if (!this.isMissingFile(error)) throw error;
      this.cursors.delete(filePath);
    }
  }

  private isMissingFile(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
  }
}
