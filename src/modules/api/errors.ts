type ApiErrorCode =
  | "analysis_already_running"
  | "no_reports_found"
  | "not_found"
  | "invalid_report_name"
  | "delete_failed"
  | "internal_error";

const statusByCode: Record<ApiErrorCode, number> = {
  analysis_already_running: 409,
  no_reports_found: 404,
  not_found: 404,
  invalid_report_name: 400,
  delete_failed: 500,
  internal_error: 500
};

export class ApiError extends Error {
  public readonly status: number;

  constructor(
    public readonly code: ApiErrorCode,
    message?: string
  ) {
    super(message ?? code);
    this.status = statusByCode[code];
  }
}

export function toApiErrorResponse(error: unknown): {
  status: number;
  body: { error: ApiErrorCode; message?: string };
} {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: { error: error.code, message: error.message }
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    status: 500,
    body: { error: "internal_error", message }
  };
}
