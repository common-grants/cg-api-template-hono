import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import { createApp, type App } from "../src/app.js";
import { exportOpenApi } from "../scripts/export-openapi.js";
import { stubRepository } from "./support.js";

interface Operation {
  responses: Record<string, { content?: Record<string, { schema?: unknown }> }>;
}
interface Document {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, Operation>>;
}

const OPERATIONS: [path: string, method: string, statuses: string[]][] = [
  ["/health", "get", ["200"]],
  ["/common-grants/opportunities", "get", ["200", "400", "500"]],
  ["/common-grants/opportunities/{oppId}", "get", ["200", "400", "404", "500"]],
  ["/common-grants/opportunities/search", "post", ["200", "400", "500"]],
];

let workDir: string;
let served: Document;
let exported: Document;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "cg-openapi-"));

  const app = createApp(stubRepository());
  served = (await (await app.request("/openapi.json")).json()) as Document;

  const written = await exportOpenApi(join(workDir, "openapi.json"), app);
  exported = JSON.parse(await readFile(written, "utf8")) as Document;
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("the exported document", () => {
  it("is the same document the API serves", () => {
    expect(exported).toEqual(served);
  });

  it("is OpenAPI 3.1", () => {
    expect(exported.openapi).toBe("3.1.0");
    expect(exported.info.title).toBeTruthy();
    expect(exported.info.version).toBeTruthy();
  });

  it("documents every route the application registers and nothing else", () => {
    const documented = Object.entries(exported.paths)
      .flatMap(([path, ops]) => Object.keys(ops).map(method => `${method} ${path}`))
      .sort();
    const expected = OPERATIONS.map(([path, method]) => `${method} ${path}`).sort();
    expect(documented).toEqual(expected);
  });

  it.each(OPERATIONS)(
    "gives %s %s a JSON schema for each declared status",
    (path, method, statuses) => {
      const operation = exported.paths[path]?.[method];
      expect(operation, `${method} ${path} is missing`).toBeDefined();
      expect(Object.keys(operation!.responses).sort()).toEqual([...statuses].sort());

      for (const status of statuses) {
        const schema = operation!.responses[status]?.content?.["application/json"]?.schema;
        expect(schema, `${method} ${path} ${status} has no JSON schema`).toBeTypeOf("object");
        // A bare `{}` would satisfy "has a schema" while documenting nothing.
        expect(Object.keys(schema as object).length).toBeGreaterThan(0);
      }
    }
  );

  it("describes the opportunity payload rather than an opaque object", () => {
    const schema = exported.paths["/common-grants/opportunities"]?.["get"]?.responses["200"]
      ?.content?.["application/json"]?.schema as {
      properties: { items: { items: { properties: Record<string, unknown>; required: string[] } } };
    };
    const item = schema.properties.items.items;
    expect(item.required).toEqual(
      expect.arrayContaining([
        "id",
        "title",
        "status",
        "description",
        "createdAt",
        "lastModifiedAt",
      ])
    );
    expect(item.properties["id"]).toMatchObject({ type: "string", format: "uuid" });
    expect(item.properties["lastModifiedAt"]).toMatchObject({
      type: "string",
      format: "date-time",
    });
  });
});

describe("export failures", () => {
  it("refuses to write a file when the endpoint does not answer 200", async () => {
    const empty = new OpenAPIHono() as App;
    const target = join(workDir, "never-written.json");

    await expect(exportOpenApi(target, empty)).rejects.toThrow(/responded with 404/);
    await expect(readFile(target, "utf8")).rejects.toThrow();
  });

  it("refuses to write a file when the endpoint does not answer JSON", async () => {
    const notJson = new OpenAPIHono() as App;
    notJson.get("/openapi.json", c => c.text("<html>not a spec</html>"));
    const target = join(workDir, "also-never-written.json");

    await expect(exportOpenApi(target, notJson)).rejects.toThrow(/readable JSON/);
    await expect(readFile(target, "utf8")).rejects.toThrow();
  });
});
