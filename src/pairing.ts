import crypto from "node:crypto";

export interface PairingSnapshot {
  code: string;
  expiresAt: number;
}

export type PairingVerification = "accepted" | "invalid" | "locked";

export interface PairingCodes {
  current(): PairingSnapshot;
  refresh(): PairingSnapshot;
  verify(candidate: string): PairingVerification;
}

interface PairingCodeOptions {
  now?: () => number;
  generate?: () => string;
  ttlMs?: number;
  maxAttempts?: number;
}

export function createPairingCodes(options: PairingCodeOptions = {}): PairingCodes {
  const now = options.now ?? Date.now;
  const generate = options.generate ?? (() => crypto.randomBytes(4).toString("hex").toUpperCase());
  const ttlMs = options.ttlMs ?? 10 * 60 * 1000;
  const maxAttempts = options.maxAttempts ?? 10;
  let code = "";
  let expiresAt = 0;
  let attempts = 0;

  const refresh = (): PairingSnapshot => {
    code = generate();
    expiresAt = now() + ttlMs;
    attempts = 0;
    return { code, expiresAt };
  };

  const current = (): PairingSnapshot => {
    if (!code || now() >= expiresAt) return refresh();
    return { code, expiresAt };
  };

  return {
    current,
    refresh,
    verify(candidate: string): PairingVerification {
      const active = current();
      if (attempts >= maxAttempts) return "locked";
      attempts += 1;
      const expectedValue = Buffer.from(active.code);
      const candidateValue = Buffer.from(candidate.trim().toUpperCase());
      if (expectedValue.length !== candidateValue.length || !crypto.timingSafeEqual(expectedValue, candidateValue)) return "invalid";
      return "accepted";
    },
  };
}
