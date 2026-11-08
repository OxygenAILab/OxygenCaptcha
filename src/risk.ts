import { isIP } from "node:net";
import type { ClientContext, RiskLevel } from "./types.js";

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

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function timezoneOffsetMinutesEast(value: string, at = Date.now()): number | undefined {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: value,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(at));
    const part = (type: Intl.DateTimeFormatPartTypes): number => {
      const raw = parts.find((entry) => entry.type === type)?.value;
      return raw ? Number.parseInt(raw, 10) : Number.NaN;
    };
    const year = part("year");
    const month = part("month");
    const day = part("day");
    const hour = part("hour");
    const minute = part("minute");
    const second = part("second");
    if (![year, month, day, hour, minute, second].every(Number.isFinite)) {
      return undefined;
    }
    const actual = new Date(at);
    const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const actualAsUtc = Date.UTC(
      actual.getUTCFullYear(),
      actual.getUTCMonth(),
      actual.getUTCDate(),
      actual.getUTCHours(),
      actual.getUTCMinutes(),
      actual.getUTCSeconds(),
    );
    return Math.round((wallAsUtc - actualAsUtc) / 60_000);
  } catch {
    return undefined;
  }
}

const COUNTRY_TIMEZONE_AREA: Record<string, string> = {
  AU: "Australia",
  CA: "America",
  CN: "Asia",
  DE: "Europe",
  FR: "Europe",
  GB: "Europe",
  HK: "Asia",
  JP: "Asia",
  KR: "Asia",
  MO: "Asia",
  SG: "Asia",
  TW: "Asia",
  US: "America",
};

export class RiskTracker {
  private readonly records = new Map<string, RiskRecord>();

  assess(
    request: RiskRequest,
    production: boolean,
    requested?: RiskLevel,
    clientContext?: ClientContext,
  ): RiskAssessment {
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

    if (clientContext) {
      if (clientContext.webdriver) {
        score += 65;
        reasons.push("webdriver-detected");
      }
      if (!validTimezone(clientContext.timezone)) {
        score += 10;
        reasons.push("invalid-timezone");
      } else if (
        /^UTC$|^Etc\/UTC$|^Etc\/Unknown$/i.test(clientContext.timezone)
      ) {
        score += 4;
        reasons.push("generic-timezone");
      }
      const expectedArea = country ? COUNTRY_TIMEZONE_AREA[country] : undefined;
      const timezoneArea = clientContext.timezone.split("/")[0];
      if (expectedArea && timezoneArea && timezoneArea !== expectedArea) {
        score += 5;
        reasons.push("country-timezone-mismatch");
      }
      if (!clientContext.systemLanguage) {
        score += 8;
        reasons.push("missing-system-language");
      }
      if (!clientContext.languages?.length) {
        score += 3;
        reasons.push("missing-language-list");
      }
      const selectedLanguage = clientContext.selectedLanguage?.toLowerCase();
      const systemLanguage = clientContext.systemLanguage?.toLowerCase();
      if (
        selectedLanguage &&
        systemLanguage &&
        selectedLanguage.split("-")[0] !== systemLanguage.split("-")[0] &&
        !clientContext.languages?.some(
          (candidate) =>
            candidate.toLowerCase().split("-")[0] === selectedLanguage.split("-")[0],
        )
      ) {
        score += 5;
        reasons.push("selected-language-mismatch");
      }
      if ((clientContext.languages?.length ?? 0) > 8) {
        score += 5;
        reasons.push("excessive-language-list");
      }
      const observedOffset = validTimezone(clientContext.timezone)
        ? timezoneOffsetMinutesEast(clientContext.timezone)
        : undefined;
      if (
        observedOffset !== undefined &&
        Math.abs(observedOffset + clientContext.timezoneOffsetMinutes) > 30
      ) {
        score += 6;
        reasons.push("timezone-offset-mismatch");
      }
      const platform = clientContext.platform?.toLowerCase() ?? "";
      if (
        platform &&
        ((platform.includes("win") && !/windows/i.test(userAgent)) ||
          (platform.includes("android") && !/android/i.test(userAgent)) ||
          ((platform.includes("iphone") || platform.includes("ipad")) &&
            !/iphone|ipad|ios/i.test(userAgent)))
      ) {
        score += 5;
        reasons.push("client-platform-mismatch");
      }
      if (clientContext.cookiesEnabled === false) {
        score += 2;
        reasons.push("cookies-disabled");
      }
      if (
        clientContext.screen &&
        (clientContext.screen.width <= 0 ||
          clientContext.screen.height <= 0 ||
          clientContext.screen.width > 16_384 ||
          clientContext.screen.height > 16_384 ||
          clientContext.screen.pixelRatio <= 0 ||
          clientContext.screen.pixelRatio > 8)
      ) {
        score += 7;
        reasons.push("implausible-screen");
      }
      if (
        clientContext.hardwareConcurrency !== undefined &&
        (clientContext.hardwareConcurrency <= 0 ||
          clientContext.hardwareConcurrency > 128)
      ) {
        score += 6;
        reasons.push("implausible-hardware");
      }
      if (
        clientContext.deviceMemory !== undefined &&
        (clientContext.deviceMemory <= 0 || clientContext.deviceMemory > 128)
      ) {
        score += 5;
        reasons.push("implausible-device-memory");
      }
      if ((clientContext.touchPoints ?? 0) > 16) {
        score += 4;
        reasons.push("implausible-touch-points");
      }
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
