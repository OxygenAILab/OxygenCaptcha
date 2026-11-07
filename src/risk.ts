import { isIP } from "node:net";
import type { RiskLevel } from "./types.js";

type HeaderValue = string | string[] | undefined;

export type RiskRequest = {
  headers: Record<string, HeaderValue>;
  ip: string;
};

export type RiskAssessment = {
  level: RiskLevel;
  score: number;
  reasons: string[];
  ip: string;
  country?: string;
  userAgent: string;
  platform?: string;
  system: string;
};

type RiskRecord = {
  firstSeen: number;
  lastSeen: number;
  challenges: number;
  countries: Set<string>;
  userAgents: Set<string>;
};

const RISK_RANK: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function header(headers: RiskRequest["headers"], name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function isPrivateIp(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("fe80:")
  );
}

export function clientIp(request: RiskRequest): string {
  const candidates = [
    header(request.headers, "cf-connecting-ip"),
    header(request.headers, "x-real-ip"),
    header(request.headers, "x-forwarded-for").split(",")[0]?.trim() ?? "",
    request.ip,
  ];
  return candidates.find((candidate) => isIP(candidate) !== 0) ?? request.ip;
}

export function riskFromScore(score: number): RiskLevel {
  if (score >= 70) {
    return "critical";
  }
  if (score >= 45) {
    return "high";
  }
  if (score >= 20) {
    return "medium";
  }
  return "low";
}

export function maxRisk(left: RiskLevel, right: RiskLevel): RiskLevel {
  return RISK_RANK[left] >= RISK_RANK[right] ? left : right;
}

function systemDescription(userAgent: string): string {
  const windows = userAgent.match(/Windows NT ([\d.]+)/);
  if (windows) {
    return `Windows NT ${windows[1]}`;
  }
  const android = userAgent.match(/Android ([\d.]+)/);
  if (android) {
    return `Android ${android[1]}`;
  }
  const ios = userAgent.match(/OS (\d+)[._](\d+)/);
  if (ios) {
    return `iOS ${ios[1]}.${ios[2]}`;
  }
  const mac = userAgent.match(/Mac OS X ([\d_.]+)/);
  if (mac) {
    return `macOS ${mac[1]?.replaceAll("_", ".") ?? ""}`.trim();
  }
  const linux = userAgent.match(/Linux/);
  if (linux) {
    return "Linux";
  }
  return "unknown";
}

export class RiskTracker {
  private readonly records = new Map<string, RiskRecord>();

  assess(request: RiskRequest, production: boolean, requested?: RiskLevel): RiskAssessment {
    const now = Date.now();
    this.cleanup(now);
    const ip = clientIp(request);
    const country = header(request.headers, "cf-ipcountry").toUpperCase() || undefined;
    const userAgent = header(request.headers, "user-agent");
    const platform = header(request.headers, "sec-ch-ua-platform").replaceAll('"', "");
    const system = systemDescription(userAgent);
    const record = this.records.get(ip) ?? {
      firstSeen: now,
      lastSeen: now,
      challenges: 0,
      countries: new Set<string>(),
      userAgents: new Set<string>(),
    };
    const reasons: string[] = [];
    let score = 0;

    if (!userAgent) {
      score += 28;
      reasons.push("missing-user-agent");
    } else if (/(headless|phantomjs|electron\/|playwright|puppeteer)/i.test(userAgent)) {
      score += 35;
      reasons.push("automation-user-agent");
    } else if (/(bot|crawler|spider|curl|wget|python-requests|postmanruntime|go-http-client)/i.test(userAgent)) {
      score += 32;
      reasons.push("bot-user-agent");
    }

    const language = header(request.headers, "accept-language");
    if (!language) {
      score += 8;
      reasons.push("missing-language");
    }
    if (!header(request.headers, "accept")) {
      score += 5;
      reasons.push("missing-accept");
    }
    if (!header(request.headers, "sec-fetch-mode")) {
      score += 6;
      reasons.push("missing-fetch-metadata");
    }

    const chromium = /(Chrome|Chromium|Edg)\//i.test(userAgent);
    if (chromium && !header(request.headers, "sec-ch-ua")) {
      score += 8;
      reasons.push("missing-client-hints");
    }
    if (platform && /Windows/i.test(userAgent) && !/Windows/i.test(platform)) {
      score += 16;
      reasons.push("platform-mismatch");
    }
    const mobileHint = header(request.headers, "sec-ch-ua-mobile");
    if (mobileHint && /Mobile/.test(userAgent) !== (mobileHint === "?1")) {
      score += 7;
      reasons.push("mobile-hint-mismatch");
    }
    if (/Windows NT (5|6\.0|6\.1|6\.2|6\.3)/.test(userAgent)) {
      score += 9;
      reasons.push("legacy-windows");
    }
    if (/Android ([0-9]|10)(\.|;|\))/.test(userAgent)) {
      score += 6;
      reasons.push("legacy-android");
    }
    const chromeVersion = userAgent.match(/(?:Chrome|Chromium|Edg)\/(\d+)/);
    if (chromeVersion && Number.parseInt(chromeVersion[1] ?? "999", 10) < 100) {
      score += 8;
      reasons.push("legacy-browser");
    }
    if (production && !isPrivateIp(ip) && !country) {
      score += 6;
      reasons.push("missing-cloudflare-country");
    }
    if (country && language && /^zh/i.test(country) && !/^zh/i.test(language)) {
      score += 3;
      reasons.push("country-language-weak-mismatch");
    }

    if (now - record.lastSeen < 60_000) {
      if (record.challenges >= 15) {
        score += 15;
        reasons.push("high-request-frequency");
      }
      if (record.challenges >= 40) {
        score += 20;
        reasons.push("very-high-request-frequency");
      }
      if (record.userAgents.size >= 3 && !record.userAgents.has(userAgent)) {
        score += 12;
        reasons.push("ip-user-agent-rotation");
      }
      if (record.countries.size >= 2 && country && !record.countries.has(country)) {
        score += 8;
        reasons.push("ip-country-rotation");
      }
    }

    record.lastSeen = now;
    record.challenges += 1;
    if (country) {
      record.countries.add(country);
    }
    if (userAgent) {
      record.userAgents.add(userAgent);
    }
    this.records.set(ip, record);

    const computed = riskFromScore(score);
    return {
      level: requested ? maxRisk(computed, requested) : computed,
      score: Math.min(100, score),
      reasons,
      ip,
      ...(country ? { country } : {}),
      userAgent,
      ...(platform ? { platform } : {}),
      system,
    };
  }

  private cleanup(now: number): void {
    if (this.records.size < 5_000) {
      return;
    }
    for (const [ip, record] of this.records) {
      if (now - record.lastSeen > 10 * 60_000) {
        this.records.delete(ip);
      }
    }
  }
}
