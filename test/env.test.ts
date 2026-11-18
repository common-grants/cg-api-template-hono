import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("PORT", undefined);
  vi.stubEnv("DATABASE_URL", undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("process exited");
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("startup settings", () => {
  it("parses a valid configuration", async () => {
    vi.stubEnv("PORT", "4000");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/grants");

    const { env } = await import("../src/env.js");

    expect(env).toEqual({ PORT: 4000, DATABASE_URL: "postgresql://localhost/grants" });
  });

  it.each([undefined, ""])("defaults PORT=%j to 3000 without a database", async port => {
    vi.stubEnv("PORT", port);

    const { env } = await import("../src/env.js");

    expect(env.PORT).toBe(3000);
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it.each(["0", "65535"])("preserves the valid port boundary %s", async port => {
    vi.stubEnv("PORT", port);

    const { env } = await import("../src/env.js");

    expect(env.PORT).toBe(Number(port));
  });

  it.each(["abc", "-1", "65536", "1.5"])("rejects invalid PORT=%s", async port => {
    vi.stubEnv("PORT", port);

    await expect(import("../src/env.js")).rejects.toThrow("process exited");

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/^PORT: .+/));
  });

  it.each(["sqlite:local.db", "mailto:grants@example.org"])(
    "accepts the URL scheme in %s",
    async databaseUrl => {
      vi.stubEnv("DATABASE_URL", databaseUrl);

      const { env } = await import("../src/env.js");

      expect(env.DATABASE_URL).toBe(databaseUrl);
    }
  );

  it.each(["not-a-url", ""])("rejects DATABASE_URL=%j when set", async databaseUrl => {
    vi.stubEnv("DATABASE_URL", databaseUrl);

    await expect(import("../src/env.js")).rejects.toThrow("process exited");

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/^DATABASE_URL: .+/));
  });

  it("validates once rather than rereading changed environment values", async () => {
    const { env } = await import("../src/env.js");
    vi.stubEnv("PORT", "abc");

    const again = await import("../src/env.js");

    expect(again.env).toBe(env);
    expect(env.PORT).toBe(3000);
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("reports every invalid setting and exits before the server starts", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", fileURLToPath(new URL("../src/index.ts", import.meta.url))],
      {
        env: { ...process.env, PORT: "abc", DATABASE_URL: "not-a-url" },
        encoding: "utf8",
        timeout: 10000,
      }
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("PORT");
    expect(result.stderr).toContain("DATABASE_URL");
  });
});
