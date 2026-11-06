import { timingSafeEqual } from "node:crypto";
import type { AppConfig, SiteConfig } from "./types.js";

export function getSite(config: AppConfig, siteKey: string): SiteConfig | undefined {
  return config.sites.find((site) => site.key === siteKey);
}

export function siteAllowsAction(site: SiteConfig, action: string): boolean {
  return site.actions.includes("*") || site.actions.includes(action);
}

export function requestOrigin(originHeader: string | undefined, referer: string | undefined): string | null {
  if (originHeader && originHeader !== "null") {
    try {
      return new URL(originHeader).origin;
    } catch {
      return null;
    }
  }

  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }

  return null;
}

export function siteAllowsOrigin(site: SiteConfig, origin: string | null): boolean {
  if (site.origins.includes("*")) {
    return true;
  }
  return origin !== null && site.origins.includes(origin);
}

export function secretsMatch(expected: string, supplied: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, suppliedBuffer);
}
