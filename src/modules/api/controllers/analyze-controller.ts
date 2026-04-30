import { Controller, Post, Route } from "tsoa";

import { AnalyzeModeSchema } from "../schemas.js";
import { runAwayAnalysis, runOneShotAnalysis } from "../../worker/run-analysis.js";
import { tryRunWithGlobalMutex } from "../../worker/run-mutex.js";
import { resolveLatestReportPath, readAndParseReportByPath } from "../services/reports-service.js";

@Route("analyze")
export class AnalyzeController extends Controller {
  @Post("once")
  public async analyzeOnce(): Promise<{ path: string; report: unknown }> {
    return this.run("once");
  }

  @Post("away")
  public async analyzeAway(): Promise<{ path: string; report: unknown }> {
    return this.run("away");
  }

  private async run(mode: "once" | "away"): Promise<{ path: string; report: unknown }> {
    AnalyzeModeSchema.parse(mode);
    const runResult = await tryRunWithGlobalMutex(async () => {
      if (mode === "away") {
        await runAwayAnalysis();
      } else {
        await runOneShotAnalysis();
      }
    });

    if (!runResult.acquired) {
      this.setStatus(409);
      return { path: "", report: { error: "analysis_already_running" } };
    }

    const latestPath = await resolveLatestReportPath();
    if (!latestPath) {
      this.setStatus(404);
      return { path: "", report: { error: "no_reports_found" } };
    }
    const parsed = await readAndParseReportByPath(latestPath);
    return { path: latestPath, report: parsed };
  }
}

