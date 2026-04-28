import { Controller, Get, Route } from "tsoa";

@Route("health")
export class HealthController extends Controller {
  @Get()
  public health(): { ok: true } {
    return { ok: true };
  }
}

