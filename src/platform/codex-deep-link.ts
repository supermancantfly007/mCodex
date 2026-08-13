import { spawn } from "node:child_process";

export interface CodexDeepLinkCommand {
  executable: string;
  args: string[];
}

export function resolveCodexDeepLinkCommand(url: string, platform: NodeJS.Platform): CodexDeepLinkCommand {
  if (platform === "win32") return { executable: "explorer.exe", args: [url] };
  if (platform === "darwin") return { executable: "open", args: [url] };
  throw new Error(`Opening Codex thread deep links is not supported on ${platform}`);
}

export function openCodexThread(threadId: string): void {
  const url = `codex://threads/${encodeURIComponent(threadId)}`;
  const command = resolveCodexDeepLinkCommand(url, process.platform);
  const child = spawn(command.executable, command.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.once("error", (error) => console.warn(`Unable to open Codex thread deep link: ${error.message}`));
  child.unref();
}
