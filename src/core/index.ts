import { runCli } from "./cli.js";

runCli().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Log assistant failed: ${message}`);
  process.exitCode = 1;
});
