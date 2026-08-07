import { config } from "./config.js";
import { createBridge } from "./server.js";

async function main(): Promise<void> {
  const bridge = await createBridge();
  console.log(`mCodex: http://${config.host}:${config.port}`);
  console.log("Codex control: local only");

  async function shutdown(): Promise<void> {
    await bridge.close();
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
