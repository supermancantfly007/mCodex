import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const host = process.env.BRIDGE_HOST ?? "127.0.0.1";
const configuredToken = process.env.BRIDGE_TOKEN?.trim() ?? "";
const loopbackHosts = ["127.0.0.1", "localhost", "::1"];
const defaultPushSubject = "https://github.com/supermancantfly007/mCodex";

export function resolveExternalAccess(hostname: string, configured: string | undefined): boolean {
  const exposedByHost = !loopbackHosts.includes(hostname.toLowerCase());
  if (configured == null || !configured.trim()) return exposedByHost;
  if (/^(?:1|true|yes|on)$/i.test(configured.trim())) return true;
  if (/^(?:0|false|no|off)$/i.test(configured.trim())) return exposedByHost;
  throw new Error("BRIDGE_EXTERNAL_ACCESS must be true or false when it is set");
}

export function resolvePushSubject(configured: string | undefined): string {
  const candidate = configured?.trim() || defaultPushSubject;
  let url: URL;
  try { url = new URL(candidate); } catch { throw new Error("BRIDGE_PUSH_SUBJECT must be an HTTPS or mailto URL"); }
  if (!["https:", "mailto:"].includes(url.protocol)) throw new Error("BRIDGE_PUSH_SUBJECT must be an HTTPS or mailto URL");
  return candidate;
}

const external = resolveExternalAccess(host, process.env.BRIDGE_EXTERNAL_ACCESS);
const codexHome = process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
const tokenFile = process.env.BRIDGE_TOKEN_FILE?.trim() || path.join(codexHome, "remote-bridge-token");
const pushStateFile = process.env.BRIDGE_PUSH_STATE_FILE?.trim() || path.join(path.dirname(tokenFile), "web-push-state.json");

function persistentToken(): { value: string; persisted: boolean } {
  if (!external) return { value: "", persisted: false };
  if (configuredToken) return { value: configuredToken, persisted: false };

  try {
    const saved = readFileSync(tokenFile, "utf8").trim();
    if (/^[A-Za-z0-9_-]{24,}$/.test(saved)) return { value: saved, persisted: true };
  } catch {
    // The token file is created below on the first external start.
  }

  const generated = crypto.randomBytes(32).toString("base64url");
  try {
    mkdirSync(path.dirname(tokenFile), { recursive: true });
    writeFileSync(tokenFile, `${generated}\n`, { encoding: "utf8", mode: 0o600 });
    chmodSync(tokenFile, 0o600);
    return { value: generated, persisted: true };
  } catch (error) {
    console.warn(`无法保存 Bridge 设备信任令牌：${error instanceof Error ? error.message : String(error)}`);
    return { value: generated, persisted: false };
  }
}

const resolvedToken = persistentToken();
const token = configuredToken || resolvedToken.value;

if (external && token.length < 24) {
  throw new Error("BRIDGE_TOKEN must contain at least 24 characters when remote access is enabled");
}

export const config = {
  host,
  external,
  tokenGenerated: external && !configuredToken && !resolvedToken.persisted,
  tokenPersisted: external && !configuredToken && resolvedToken.persisted,
  tokenFile,
  pushStateFile,
  pushSubject: resolvePushSubject(process.env.BRIDGE_PUSH_SUBJECT),
  port: Number(process.env.BRIDGE_PORT ?? 3210),
  token,
  codexHome,
  cdpUrl: process.env.CODEX_CDP_URL ?? "http://localhost:9222",
  scanIntervalMs: Number(process.env.BRIDGE_SCAN_INTERVAL_MS ?? 500),
};
