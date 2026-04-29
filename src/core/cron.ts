import cron from "node-cron";
import { config } from "./config.js";
import { cleanupOldReports } from "../modules/worker/reports-cleanup.js";
import { tryRunWithGlobalMutex } from "../modules/worker/run-mutex.js";
import { runOneShotAnalysis } from "../modules/worker/run-analysis.js";

export async function runCron(): Promise<void> {
  const runCleanupJob = async (): Promise<void> => {
    const lock = await tryRunWithGlobalMutex(async () =>
      cleanupOldReports({
        reportsDir: config.reportsDir,
        reportPrefix: config.reportPrefix,
        retentionDays: config.reportRetentionDays
      })
    );

    if (!lock.acquired) {
      return;
    }
  };

  // Run immediately on startup, then schedule.
  const runAnalysisJob = async (): Promise<void> => {
    const lock = await tryRunWithGlobalMutex(async () => {
      await runOneShotAnalysis();
    });
    if (!lock.acquired) {
      return;
    }

    if (!config.reportCleanupCron) {
      await runCleanupJob();
    }
  };

  await runAnalysisJob();

  cron.schedule(config.cronSchedule, () => {
    void runAnalysisJob();
  });

  if (config.reportCleanupCron) {
    cron.schedule(config.reportCleanupCron, () => {
      void runCleanupJob();
    });
  }

  // Keep process alive. (node-cron uses timers, but explicit is clearer for container usage.)
  await new Promise<void>(() => {});
}

