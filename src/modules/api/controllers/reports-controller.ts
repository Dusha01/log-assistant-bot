import { Controller, Delete, Get, Path, Route } from "tsoa";
import { z } from "zod";

import {
  deleteReportByName,
  DeleteReportError,
  listReportFiles,
  readAndParseReportByPath,
  resolveLatestReportPath
} from "../services/reports-service.js";

const ReportNameSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9._-]+\.md$/)
  .refine((name) => !name.includes(".."), "invalid");

@Route("reports")
export class ReportsController extends Controller {
  @Get()
  public async list(): Promise<{ reports: { name: string; path: string }[] }> {
    const reports = await listReportFiles();
    return { reports };
  }

  @Get("latest")
  public async latest(): Promise<{ path: string; report: unknown }> {
    const latestPath = await resolveLatestReportPath();
    if (!latestPath) {
      this.setStatus(404);
      return { path: "", report: { error: "no_reports_found" } };
    }
    const parsed = await readAndParseReportByPath(latestPath);
    return { path: latestPath, report: parsed };
  }

  @Get("{fileName}")
  public async get(@Path() fileName: string): Promise<{ path: string; report: unknown }> {
    const safeName = ReportNameSchema.parse(fileName);
    const fullPath = (await listReportFiles()).find((r) => r.name === safeName)?.path;
    if (!fullPath) {
      this.setStatus(404);
      return { path: "", report: { error: "not_found" } };
    }
    const parsed = await readAndParseReportByPath(fullPath);
    return { path: fullPath, report: parsed };
  }

  @Delete("{fileName}")
  public async delete(@Path() fileName: string): Promise<{ deleted: boolean; path: string; error?: string }> {
    try {
      const safeName = ReportNameSchema.parse(fileName);
      const result = await deleteReportByName(safeName);
      return { deleted: true, path: result.path };
    } catch (error) {
      if (error instanceof DeleteReportError) {
        if (error.code === "invalid_name") {
          this.setStatus(400);
          return { deleted: false, path: "", error: "invalid_name" };
        }
        this.setStatus(404);
        return { deleted: false, path: "", error: "not_found" };
      }

      this.setStatus(500);
      return { deleted: false, path: "", error: "delete_failed" };
    }
  }
}

