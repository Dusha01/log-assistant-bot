import cron from "node-cron";
import { config } from "./config.js";
import { runOneShotAnalysis } from "../modules/worker/run-analysis.js";

export async function runCron(): Promise<void> {
  let running = false;

  // Run immediately on startup, then schedule.
  const run = async (): Promise<void> => {
    if (running) {
      return;
    }
    running = true;
    try {
      await runOneShotAnalysis();
    } finally {
      running = false;
    }
  };

  await run();

  cron.schedule(config.cronSchedule, () => {
    void run();
  });

  // Keep process alive. (node-cron uses timers, but explicit is clearer for container usage.)
  await new Promise<void>(() => {});
}

