import { Controller, Delete, Get, Path, Route } from "tsoa";

import { ApiError, toApiErrorResponse } from "../errors.js";
import { ReportFileNameSchema } from "../schemas.js";
import {
  deleteReportByName,
  listReportFiles,
  readAndParseReportByPath,
  resolveLatestReportPath
} from "../services/reports-service.js";

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
    const parsedName = ReportFileNameSchema.safeParse(fileName);
    if (!parsedName.success) {
      this.setStatus(400);
      return { path: "", report: { error: "invalid_report_name" } };
    }
    const safeName = parsedName.data;
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
      const parsedName = ReportFileNameSchema.safeParse(fileName);
      if (!parsedName.success) {
        throw new ApiError("invalid_report_name", "invalid report name");
      }
      const safeName = parsedName.data;
      const result = await deleteReportByName(safeName);
      return { deleted: true, path: result.path };
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      this.setStatus(mapped.status);
      return { deleted: false, path: "", error: mapped.body.error };
    }
  }
}

