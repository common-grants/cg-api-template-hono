/**
 * The Node entrypoint.
 *
 * This is the only file that knows the app runs on Node: it composes the
 * bundled fixtures with {@link createApp} and hands the resulting `fetch`
 * handler to `@hono/node-server`. Swapping in another runtime means writing
 * another file like this one, not touching the app.
 */

import { serve } from "@hono/node-server";
import { env } from "./env.js";
import { createApp } from "./app.js";
import { fixtureRepository } from "./data/fixtures.js";

const app = createApp({ repository: fixtureRepository });

serve({ fetch: app.fetch, port: env.PORT }, info => {
  console.log(`CommonGrants API listening on http://localhost:${info.port}`);
  console.log(`  Opportunities  http://localhost:${info.port}/common-grants/opportunities`);
  console.log(`  OpenAPI        http://localhost:${info.port}/openapi.json`);
  console.log(`  Docs           http://localhost:${info.port}/docs`);
  console.log(`  Health         http://localhost:${info.port}/health`);
});
