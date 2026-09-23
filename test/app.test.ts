import { describe, expect, it, vi } from "vitest";
import { ErrorSchema, SuccessSchema } from "@common-grants/sdk/schemas";
import { HTTPException } from "hono/http-exception";
import { createApp } from "../src/app.js";
import { stubRepository } from "./support.js";

function app() {
  return createApp(stubRepository());
}

describe("createApp", () => {
  it("constructs without side effects", () => {
    // Constructing the app must stay side-effect free: the export script and
    // the test suite both build one without wanting a listening server.
    expect(() => app()).not.toThrow();
  });

  it("serves a health check that validates against the SDK success schema", async () => {
    const res = await app().request("/health");
    expect(res.status).toBe(200);
    expect(SuccessSchema.safeParse(await res.json()).success).toBe(true);
  });

  it("serves an OpenAPI 3.1 document", async () => {
    const res = await app().request("/openapi.json");
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { openapi: string };
    expect(doc.openapi).toBe("3.1.0");
  });

  it("answers an unrouted path with an ErrorSchema-valid 404", async () => {
    const res = await app().request("/no-such-route");
    expect(res.status).toBe(404);
    const body = ErrorSchema.parse(await res.json());
    expect(body.status).toBe(404);
  });

  it("answers a malformed JSON body with an ErrorSchema-valid 400", async () => {
    const res = await app().request("/common-grants/opportunities/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ this is not json",
    });
    expect(res.status).toBe(400);
    // Not Hono's plain-text default body.
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(ErrorSchema.parse(await res.json()).status).toBe(400);
  });

  it("answers a thrown repository failure with an ErrorSchema-valid 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = createApp(stubRepository({ throws: new Error("database is on fire") }));

    const res = await failing.request("/common-grants/opportunities");

    expect(res.status).toBe(500);
    const body = ErrorSchema.parse(await res.json());
    expect(body.status).toBe(500);
    // The underlying failure is logged, never returned.
    expect(JSON.stringify(body)).not.toContain("database is on fire");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  // A 4xx HTTPException message is addressed to the caller and passes through
  // (the malformed-JSON case above). A 5xx one describes the server: the status
  // survives, the message does not.
  it("keeps the status but not the message of a 5xx HTTPException", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = createApp(
      stubRepository({
        throws: new HTTPException(503, { message: "pool exhausted on db-1.internal" }),
      })
    );

    const res = await failing.request("/common-grants/opportunities");

    expect(res.status).toBe(503);
    const body = ErrorSchema.parse(await res.json());
    expect(body.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain("db-1.internal");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
