import { z } from "zod";

const result = z
  .object({
    PORT: z.coerce.number().int().min(0).max(65535),
    DATABASE_URL: z.url().optional(),
  })
  .safeParse({
    // `||`, not `??`: an empty PORT must not coerce to the random port 0.
    PORT: process.env.PORT || 3000,
    DATABASE_URL: process.env.DATABASE_URL,
  });

if (!result.success) {
  for (const issue of result.error.issues) {
    console.error(`${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = result.data;
