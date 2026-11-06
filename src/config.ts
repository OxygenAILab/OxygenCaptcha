import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { AppConfig, SiteConfig } from "./types.js";

const siteSchema = z.object({
  key: z.string().min(4),
  secret: z.string().min(12),
  origins: z.array(z.string()).min(1),
  actions: z.array(z.string().min(1)).min(1),
});

const sitesSchema = z.array(siteSchema).min(1);

function integerFromEnv(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Environment integer must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function parseSites(value: string | undefined, nodeEnv: AppConfig["nodeEnv"]): SiteConfig[] {
  if (!value) {
    if (nodeEnv === "production") {
      throw new Error("OXY_SITES_JSON is required in production");
    }

    return [
      {
        key: "oc_dev_public",
        secret: "oc_dev_secret_change_me",
        origins: ["*"],
        actions: ["submit"],
      },
    ];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("OXY_SITES_JSON must be valid JSON");
  }

  const result = sitesSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid OXY_SITES_JSON: ${result.error.message}`);
  }

  return result.data;
}

function parseSeed(value: string | undefined): Buffer | undefined {
  if (!value) {
    return undefined;
  }

  const seed = Buffer.from(value, "base64");
  if (seed.length !== 32) {
    throw new Error("OXY_TOKEN_SEED_BASE64 must decode to exactly 32 bytes");
  }
  return seed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawNodeEnv = env.NODE_ENV ?? "development";
  const nodeEnv =
    rawNodeEnv === "production" || rawNodeEnv === "test" ? rawNodeEnv : "development";
  const seed = parseSeed(env.OXY_TOKEN_SEED_BASE64);
  if (nodeEnv === "production" && !seed) {
    throw new Error("OXY_TOKEN_SEED_BASE64 is required in production");
  }

  return {
    nodeEnv,
    host: env.HOST ?? "127.0.0.1",
    port: integerFromEnv(env.PORT, 8787, 1, 65_535),
    publicOrigin: (env.PUBLIC_ORIGIN ?? "http://127.0.0.1:8787").replace(/\/$/, ""),
    challengeTtlSeconds: integerFromEnv(env.CHALLENGE_TTL_SECONDS, 300, 30, 900),
    tokenTtlSeconds: integerFromEnv(env.TOKEN_TTL_SECONDS, 120, 30, 300),
    maxAttempts: integerFromEnv(env.MAX_ATTEMPTS, 3, 1, 5),
    rateLimitMax: integerFromEnv(env.RATE_LIMIT_MAX, 120, 10, 10_000),
    sites: parseSites(env.OXY_SITES_JSON, nodeEnv),
    ...(seed ? { tokenSeed: seed } : nodeEnv === "development" ? { tokenSeed: randomBytes(32) } : {}),
  };
}
