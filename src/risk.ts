import { isIP } from "node:net";
import { RISK_STEPS, type ClientContext, type RiskLevel } from "./types.js";

type HeaderValue = string | string[] | undefined;

export type RiskRequest = {
  headers: Record<string, HeaderValue>;
  ip: string;
};

export type RiskAssessment = {
  level: RiskLevel;
  band: number;
  score: number;
  recommendedSteps: number;
  requestedSteps: number;
  policyVersion: string;
  signals: RiskSignalScores;
  reasons: string[];
  ip: string;
  country?: string;
  userAgent: string;
  platform?: string;
  system: string;
};

export type RiskSignalScores = {
  automation: number;
  environment: number;
  reputation: number;
  embedding: number;
};

export const RISK_POLICY_VERSION = "2026-11-24.1";

export const RISK_BANDS = [
  { band: 1, minScore: 0, maxScore: 11, level: "low", steps: 1 },
  { band: 2, minScore: 12, maxScore: 24, level: "low", steps: 2 },
  { band: 3, minScore: 25, maxScore: 37, level: "medium", steps: 3 },
  { band: 4, minScore: 38, maxScore: 49, level: "medium", steps: 4 },
  { band: 5, minScore: 50, maxScore: 62, level: "high", steps: 5 },
  { band: 6, minScore: 63, maxScore: 74, level: "high", steps: 6 },
  { band: 7, minScore: 75, maxScore: 87, level: "critical", steps: 7 },
  { band: 8, minScore: 88, maxScore: 100, level: "critical", steps: 8 },
] as const satisfies ReadonlyArray<{
  band: number;
  minScore: number;
  maxScore: number;
  level: RiskLevel;
  steps: number;
}>;

export const RISK_CATEGORY_CAPS: RiskSignalScores = {
  automation: 65,
  environment: 25,
  reputation: 20,
  embedding: 10,
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

export function riskBandFromScore(score: number): number {
  const normalized = Math.max(0, Math.min(100, score));
  for (let index = RISK_BANDS.length - 1; index >= 0; index -= 1) {
    const band = RISK_BANDS[index];
    if (band && normalized >= band.minScore) {
      return band.band;
    }
  }
  return 1;
}

export function riskFromScore(score: number): RiskLevel {
  return RISK_BANDS[riskBandFromScore(score) - 1]?.level ?? "low";
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

function platformFamily(value: string | undefined): string | undefined {
  const normalized = value?.toLowerCase() ?? "";
  if (/windows|win32|win64/.test(normalized)) return "windows";
  if (/android/.test(normalized)) return "android";
  if (/iphone|ipad|ios/.test(normalized)) return "ios";
  if (/macintosh|macos|mac os/.test(normalized)) return "macos";
  if (/linux/.test(normalized)) return "linux";
  return undefined;
}

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
    const signals: RiskSignalScores = {
      automation: 0,
      environment: 0,
      reputation: 0,
      embedding: 0,
    };
    const add = (
      group: keyof RiskSignalScores,
      points: number,
      reason: string,
    ): void => {
      signals[group] += points;
      reasons.push(reason);
    };

    if (!userAgent) {
      add("automation", 22, "missing-user-agent");
    } else if (/(headless|phantomjs|playwright|puppeteer)/i.test(userAgent)) {
      add("automation", 45, "automation-user-agent");
    } else if (/(bot|crawler|spider|curl|wget|python-requests|postmanruntime|go-http-client)/i.test(userAgent)) {
      add("automation", 42, "bot-user-agent");
    } else if (/electron\//i.test(userAgent)) {
      add("environment", 4, "desktop-shell-runtime");
    }

    const language = header(request.headers, "accept-language");
    if (!language) {
      add("automation", 6, "missing-language");
    }
    if (!header(request.headers, "accept")) {
      add("automation", 4, "missing-accept");
    }
    if (!header(request.headers, "sec-fetch-mode")) {
      add("automation", 6, "missing-fetch-metadata");
    }

    const chromium = /(Chrome|Chromium|Edg)\//i.test(userAgent);
    if (chromium && !header(request.headers, "sec-ch-ua")) {
      add("automation", 7, "missing-client-hints");
    }
    const headerPlatformFamily = platformFamily(platform);
    const uaPlatformFamily = platformFamily(userAgent);
    if (
      headerPlatformFamily &&
      uaPlatformFamily &&
      headerPlatformFamily !== uaPlatformFamily
    ) {
      add("environment", 12, "platform-mismatch");
    }
    const mobileHint = header(request.headers, "sec-ch-ua-mobile");
    if (mobileHint && /Mobile/.test(userAgent) !== (mobileHint === "?1")) {
      add("environment", 6, "mobile-hint-mismatch");
    }
    if (/Windows NT (5|6\.0|6\.1|6\.2|6\.3)/.test(userAgent)) {
      add("environment", 8, "legacy-windows");
    }
    if (/Android ([0-9]|10)(\.|;|\))/.test(userAgent)) {
      add("environment", 6, "legacy-android");
    }
    const chromeVersion = userAgent.match(/(?:Chrome|Chromium|Edg)\/(\d+)/);
    if (chromeVersion && Number.parseInt(chromeVersion[1] ?? "999", 10) < 100) {
      add("environment", 7, "legacy-browser");
    }
    if (production && !isPrivateIp(ip) && !country) {
      add("environment", 5, "missing-cloudflare-country");
    }
    if (
      country &&
      language &&
      ["CN", "HK", "MO", "TW", "SG"].includes(country) &&
      !/^zh/i.test(language)
    ) {
      add("environment", 2, "country-language-weak-mismatch");
    }

    if (clientContext) {
      if (clientContext.webdriver) {
        add("automation", 60, "webdriver-detected");
      }
      if (!validTimezone(clientContext.timezone)) {
        add("environment", 9, "invalid-timezone");
      } else if (
        /^UTC$|^Etc\/UTC$|^Etc\/Unknown$/i.test(clientContext.timezone)
      ) {
        add("environment", 3, "generic-timezone");
      }
      const expectedArea = country ? COUNTRY_TIMEZONE_AREA[country] : undefined;
      const timezoneArea = clientContext.timezone.split("/")[0];
      if (expectedArea && timezoneArea && timezoneArea !== expectedArea) {
        add("environment", 5, "country-timezone-mismatch");
      }
      if (!clientContext.systemLanguage) {
        add("environment", 7, "missing-system-language");
      }
      if (!clientContext.languages?.length) {
        add("environment", 3, "missing-language-list");
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
        add("environment", 4, "selected-language-mismatch");
      }
      if ((clientContext.languages?.length ?? 0) > 8) {
        add("environment", 4, "excessive-language-list");
      }
      const observedOffset = validTimezone(clientContext.timezone)
        ? timezoneOffsetMinutesEast(clientContext.timezone)
        : undefined;
      if (
        observedOffset !== undefined &&
        Math.abs(observedOffset + clientContext.timezoneOffsetMinutes) > 30
      ) {
        add("environment", 6, "timezone-offset-mismatch");
      }
      const contextPlatformFamily = platformFamily(clientContext.platform);
      if (
        contextPlatformFamily &&
        uaPlatformFamily &&
        contextPlatformFamily !== uaPlatformFamily
      ) {
        add("environment", 5, "client-platform-mismatch");
      }
      if (
        contextPlatformFamily &&
        headerPlatformFamily &&
        contextPlatformFamily !== headerPlatformFamily
      ) {
        add("environment", 6, "client-header-platform-mismatch");
      }
      if (clientContext.cookiesEnabled === false) {
        add("environment", 2, "cookies-disabled");
      }
      if (clientContext.embed) {
        const { embed, screen: screenInfo } = clientContext;
        if (
          screenInfo &&
          ((embed.width !== undefined && embed.width > screenInfo.width + 80) ||
            (embed.height !== undefined && embed.height > screenInfo.height + 80))
        ) {
          add("embedding", 4, "embed-bounds-outlier");
        }
        if (
          embed.placement === "fullscreen" &&
          (embed.width ?? 0) < 600
        ) {
          add("embedding", 3, "embed-placement-mismatch");
        }
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
        add("environment", 6, "implausible-screen");
      }
      if (
        clientContext.hardwareConcurrency !== undefined &&
        (clientContext.hardwareConcurrency <= 0 ||
          clientContext.hardwareConcurrency > 128)
      ) {
        add("environment", 5, "implausible-hardware");
      }
      if (
        clientContext.deviceMemory !== undefined &&
        (clientContext.deviceMemory <= 0 || clientContext.deviceMemory > 128)
      ) {
        add("environment", 4, "implausible-device-memory");
      }
      if ((clientContext.touchPoints ?? 0) > 16) {
        add("environment", 3, "implausible-touch-points");
      }
    }

    if (now - record.lastSeen < 60_000) {
      if (record.challenges >= 15) {
        add("reputation", 8, "high-request-frequency");
      }
      if (record.challenges >= 40) {
        add("reputation", 8, "very-high-request-frequency");
      }
      if (record.userAgents.size >= 3 && !record.userAgents.has(userAgent)) {
        add("reputation", 8, "ip-user-agent-rotation");
      }
      if (record.countries.size >= 2 && country && !record.countries.has(country)) {
        add("reputation", 6, "ip-country-rotation");
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

    const cappedSignals: RiskSignalScores = {
      automation: Math.min(signals.automation, RISK_CATEGORY_CAPS.automation),
      environment: Math.min(signals.environment, RISK_CATEGORY_CAPS.environment),
      reputation: Math.min(signals.reputation, RISK_CATEGORY_CAPS.reputation),
      embedding: Math.min(signals.embedding, RISK_CATEGORY_CAPS.embedding),
    };
    const score = Math.min(
      100,
      cappedSignals.automation +
        cappedSignals.environment +
        cappedSignals.reputation +
        cappedSignals.embedding,
    );
    const computed = riskFromScore(score);
    const requestedSteps = requested ? RISK_STEPS[requested] : 0;
    const recommendedSteps = Math.max(riskBandFromScore(score), requestedSteps);
    return {
      level: requested ? maxRisk(computed, requested) : computed,
      band: recommendedSteps,
      score,
      recommendedSteps,
      requestedSteps,
      policyVersion: RISK_POLICY_VERSION,
      signals: cappedSignals,
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
