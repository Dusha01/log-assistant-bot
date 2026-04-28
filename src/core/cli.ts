import { runAwayAnalysis, runOneShotAnalysis } from "../modules/worker/run-analysis.js";
import { runCron } from "./cron.js";
import { pathToFileURL } from "node:url";

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = argv;
  const runOnce = args.includes("--once");
  const runCronMode = args.includes("--cron");
  const runAway = args.includes("--away");

  // default: cron (server bot). Use --once for manual runs.
  if (runOnce) {
    await runOneShotAnalysis();
    return;
  }

  if (runAway) {
    await runAwayAnalysis();
    return;
  }

  if (runCronMode || args.length === 0) {
    await runCron();
    return;
  }

  console.error("Unsupported mode. Use --cron (default), --once or --away.");
  process.exitCode = 1;
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isDirectRun) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Log assistant failed: ${message}`);
    process.exitCode = 1;
  });
}

