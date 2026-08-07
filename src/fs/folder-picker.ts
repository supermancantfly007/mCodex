import { access, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface DirectoryEntry {
  name: string;
  path: string;
}

export interface ListResult {
  current: string | null;
  parent: string | null;
  directories: DirectoryEntry[];
  error?: string;
}

export interface RootsResult {
  home: string;
  roots: DirectoryEntry[];
}

function isDriveRoot(dirPath: string): boolean {
  return /^[A-Za-z]:[\\/]?$/.test(dirPath);
}

export async function listDrives(): Promise<string[]> {
  const drives: string[] = [];
  for (let code = "A".charCodeAt(0); code <= "Z".charCodeAt(0); code += 1) {
    const drive = `${String.fromCharCode(code)}:\\`;
    try {
      await access(drive);
      drives.push(drive);
    } catch {
      // Skip unavailable drive letters.
    }
  }
  return drives;
}

export async function listRoots(): Promise<RootsResult> {
  const home = os.homedir();
  const candidates: DirectoryEntry[] = [
    { name: "用户目录", path: home },
    { name: "桌面", path: path.join(home, "Desktop") },
    { name: "文档", path: path.join(home, "Documents") },
    { name: "下载", path: path.join(home, "Downloads") },
  ];
  const roots: DirectoryEntry[] = [];
  for (const candidate of candidates) {
    try {
      await access(candidate.path);
      roots.push(candidate);
    } catch {
      // Skip missing special folders.
    }
  }
  for (const drive of await listDrives()) {
    roots.push({ name: drive, path: drive });
  }
  return { home, roots };
}

export async function listDirectories(dirPath: string): Promise<ListResult> {
  const resolved = path.resolve(dirPath);
  try {
    const entries = await readdir(resolved, { withFileTypes: true });
    const directories: DirectoryEntry[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "." || entry.name === "..") continue;
      directories.push({ name: entry.name, path: path.join(resolved, entry.name) });
    }
    directories.sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
    const parent = isDriveRoot(resolved) ? null : path.dirname(resolved);
    return {
      current: resolved,
      parent: parent === resolved ? null : parent,
      directories,
    };
  } catch (error) {
    return {
      current: resolved,
      parent: isDriveRoot(resolved) ? null : path.dirname(resolved),
      directories: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}