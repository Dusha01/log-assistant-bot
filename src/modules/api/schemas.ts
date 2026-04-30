import { z } from "zod";

export const AnalyzeModeSchema = z.enum(["once", "away"]);

export const ReportFileNameSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9._-]+\.md$/)
  .refine((name) => !name.includes(".."), "invalid");
