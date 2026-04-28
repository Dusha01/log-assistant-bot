import "reflect-metadata";

import express from "express";
import swaggerUi from "swagger-ui-express";

import { RegisterRoutes } from "./generated/routes.js";
import openapi from "./generated/openapi.json" with { type: "json" };

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi));

  RegisterRoutes(app);

  // fallback
  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  return app;
}

