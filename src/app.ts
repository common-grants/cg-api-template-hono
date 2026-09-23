/**
 * The runtime-neutral application factory.
 *
 * `createApp()` builds the whole API from one dependency — an
 * {@link OpportunityRepository} — and never touches a socket. That is what
 * lets the test suite drive it with `app.request()` in process and lets
 * `src/index.ts` be the only file that knows about Node.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { SuccessSchema } from "@common-grants/sdk/schemas";
import type { OpportunityRepository } from "./data/repository.js";
import { createOpportunityRoutes } from "./routes/opportunities.js";
import { errorBody, validationErrorHook } from "./http.js";

/** Where the opportunities router is mounted, per the CommonGrants base API. */
export const OPPORTUNITIES_BASE_PATH = "/common-grants/opportunities";

export interface CreateAppOptions {
  repository: OpportunityRepository;
}

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["Operations"],
  summary: "Health check",
  description: "Returns 200 while the service is able to handle requests.",
  responses: {
    200: {
      description: "The service is healthy",
      content: { "application/json": { schema: SuccessSchema } },
    },
  },
});

export function createApp({ repository }: CreateAppOptions) {
  const app = new OpenAPIHono({ defaultHook: validationErrorHook });

  app.openapi(healthRoute, c => c.json({ status: 200, message: "ok" }, 200));

  app.route(OPPORTUNITIES_BASE_PATH, createOpportunityRoutes(repository));

  app.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "CommonGrants API",
      version: "0.1.0",
      description:
        "A CommonGrants API generated from the Hono template. " +
        "Requests and responses are validated with the published CommonGrants TypeScript SDK schemas.",
    },
    tags: [
      { name: "Opportunities", description: "Endpoints related to funding opportunities" },
      { name: "Operations", description: "Endpoints for operating the service" },
    ],
  });

  // An unrouted path still answers with a body a CommonGrants client can parse.
  app.notFound(c => c.json(errorBody(404, "Not found"), 404));

  app.onError((err, c) => {
    // Hono raises HTTPException for transport-level problems it detects before
    // a handler runs — a malformed JSON body, most commonly. Left alone it
    // answers with a plain-text body; re-shaping it here keeps every error
    // response valid against the SDK's ErrorSchema.
    //
    // A 4xx message describes the caller's request and is meant to be
    // returned: HTTPException is Hono's type for errors addressed to the
    // client, and its middleware (bearer auth, body limit, timeout) relies on
    // that. A 5xx one describes the server, so it is treated like any other
    // failure: status kept, message replaced, cause logged.
    if (err instanceof HTTPException && err.status < 500) {
      return c.json(errorBody(err.status, err.message), err.status);
    }
    const status = err instanceof HTTPException ? err.status : 500;
    console.error("Unhandled error while serving a request", err);
    return c.json(errorBody(status, "Internal server error"), status);
  });

  return app;
}
