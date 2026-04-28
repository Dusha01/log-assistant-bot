import { Controller, Post, Route } from "tsoa";
import { z } from "zod";

import { runAwayAnalysis, runOneShotAnalysis } from "../../worker/run-analysis.js";
import { resolveLatestReportPath, readAndParseReportByPath } from "../services/reports-service.js";

const ModeSchema = z.enum(["once", "away"]);

let analysisRunning = false;

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

  private async run(mode: z.infer<typeof ModeSchema>): Promise<{ path: string; report: unknown }> {
    if (analysisRunning) {
      this.setStatus(409);
      return { path: "", report: { error: "analysis_already_running" } };
    }

    analysisRunning = true;
    try {
      if (mode === "away") {
        await runAwayAnalysis();
      } else {
        await runOneShotAnalysis();
      }
    } finally {
      analysisRunning = false;
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

