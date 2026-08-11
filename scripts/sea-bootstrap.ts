import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getAsset, isSea } from "node:sea";

interface ReleaseManifest {
  version: string;
  webFiles: string[];
}

const requestedLocale = process.env.MCODEX_LOCALE ?? "";
const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
const locale = /^en(?:-|$)/i.test(requestedLocale) || (!requestedLocale && /^en(?:-|$)/i.test(systemLocale)) ? "en-US" : "zh-CN";
const T = (chinese: string, english: string): string => locale === "en-US" ? english : chinese;

function readAsset(name: string): Buffer {
  return Buffer.from(getAsset(name));
}

function extractAssets(): { scriptPath: string; webRoot: string } {
  const manifest = JSON.parse(readAsset("release-manifest.json").toString("utf8")) as ReleaseManifest;
  const releaseRoot = path.join(tmpdir(), "mcodex", manifest.version);
  const webRoot = path.join(releaseRoot, "web");
  mkdirSync(webRoot, { recursive: true });
  writeFileSync(path.join(releaseRoot, "package.json"), readAsset("package.json"));
  writeFileSync(path.join(releaseRoot, "browsers.json"), readAsset("browsers.json"));

  for (const relativePath of manifest.webFiles) {
    const destination = path.join(webRoot, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, readAsset(`web/${relativePath}`));
  }

  const scriptPath = path.join(releaseRoot, "start-codex-cdp.ps1");
  writeFileSync(scriptPath, readAsset("start-codex-cdp.ps1"));
  return { scriptPath, webRoot };
}

async function waitForUrl(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.status >= 200 && response.status < 500) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return false;
}

async function main(): Promise<void> {
  if (!isSea()) throw new Error("This bootstrap must run from a Node SEA executable.");

  const { scriptPath, webRoot } = extractAssets();
  if (process.argv.includes("--self-test")) {
    console.log(T(`SEA 资源已释放到 ${webRoot}`, `SEA assets extracted to ${webRoot}`));
    return;
  }

  console.log(T("正在启动 Codex Desktop（本地控制通道）...", "Starting Codex Desktop (local control channel)..."));
  const cdp = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", scriptPath,
  ], { stdio: "inherit" });
  if (cdp.status !== 0) process.exit(cdp.status ?? 1);

  console.log(T("Codex 已启动，正在等待控制通道就绪（最多 120 秒）...", "Codex started. Waiting for the control channel (up to 120 seconds)..."));
  if (!(await waitForUrl("http://localhost:9222/json/version", 120_000))) {
    throw new Error(T("Codex 控制通道在 120 秒内没有就绪。请完全退出 Codex Desktop 后重新运行。 ", "Codex control channel did not become ready within 120 seconds. Fully quit Codex Desktop and run it again."));
  }

  process.env.BRIDGE_WEB_ROOT = webRoot;
  process.env.BRIDGE_HOST ??= "0.0.0.0";
  console.log(T("控制通道已就绪，正在启动 Bridge 服务...", "Control channel is ready. Starting Bridge service..."));
  await import("../src/index.js");

  if (!(await waitForUrl("http://127.0.0.1:3210/api/health", 30_000))) {
    throw new Error(T("Bridge 服务没有在 30 秒内就绪。 ", "Bridge did not become ready within 30 seconds."));
  }

  console.log(T("Bridge 已启动，正在打开电脑端页面；手机请扫描页面中的二维码。", "Bridge is running. Opening the computer page; scan its QR code with your phone."));
  spawn("powershell.exe", [
    "-NoProfile",
    "-Command",
    "Start-Process 'http://127.0.0.1:3210/'",
  ], { detached: true, stdio: "ignore" }).unref();
}

main().catch((error) => {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
