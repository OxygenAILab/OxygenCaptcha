import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { RISK_STEPS } from "../src/challenge.js";
import { PlatformStore } from "../src/platform-store.js";
import { clientIp, maxRisk, riskFromScore, RiskTracker } from "../src/risk.js";
import { createSpeechWave, SPEECH_TEMPLATES, speechTakesValid } from "../src/speech.js";
import { verifyTurnstile } from "../src/turnstile.js";
import type {
  AppConfig,
  ChallengeEvidence,
  ChallengeState,
  ChallengeType,
  SiteConfig,
} from "../src/types.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryFile(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), "oxygenchallenge-alpha4-"));
  temporaryDirectories.push(directory);
  return join(directory, name);
}

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 8787,
    publicOrigin: "https://challenge.test",
    challengeTtlSeconds: 60,
    tokenTtlSeconds: 60,
    maxAttempts: 3,
    rateLimitMax: 1000,
    tokenSeed: randomBytes(32),
    platformDataFile: temporaryFile("platform.json"),
    sites: [
      {
        key: "site_test",
        secret: "site_test_secret_value",
        origins: ["https://app.test"],
        actions: ["submit"],
      },
    ],
    ...overrides,
  };
}

function syntheticTake(take: number, frames = 96, dimensions = 7): number[][] {
  return Array.from({ length: frames }, (_, frame) =>
    Array.from({ length: dimensions }, (_, band) => {
      const phrase = Math.sin(frame * (0.07 + band * 0.013) + take * 1.7 + band * 0.9);
      const jitter = ((((frame * 17 + band * 31 + take * 13) % 23) - 11) / 220);
      return Math.max(-8, Math.min(8, 0.5 + phrase * 0.24 + jitter));
    }),
  );
}

function syntheticTakes(takeOffset = 0): number[][][] {
  return [1 + takeOffset, 2 + takeOffset, 3 + takeOffset].map((take) => syntheticTake(take));
}

async function createChallenge(
  app: Awaited<ReturnType<typeof buildApp>>,
  type: ChallengeType,
  headers: Record<string, string> = { origin: "https://app.test" },
): Promise<{ challengeId: string; type: ChallengeType }> {
  const response = await app.app.inject({
    method: "POST",
    url: "/v1/challenges",
    headers,
    payload: { siteKey: "site_test", action: "submit", challengeType: type },
  });
  expect(response.statusCode).toBe(200);
  return response.json<{ challengeId: string; type: ChallengeType }>();
}

function stateFor(
  app: Awaited<ReturnType<typeof buildApp>>,
  challengeId: string,
): ChallengeState {
  const state = app.challenges.getForAsset(challengeId);
  expect(state).toBeDefined();
  if (!state) {
    throw new Error("challenge state missing");
  }
  return state;
}

function evidenceFor(state: ChallengeState): ChallengeEvidence {
  if (state.type === "human_check" && state.humanCheck) {
    return { answer: "human", dwellMs: state.humanCheck.minDwellMs };
  }
  if (state.type === "rotate_align" && state.rotateAlign) {
    return { angle: 0 };
  }
  if (state.type === "semantic_pick" && state.semanticPick) {
    return { answer: state.semanticPick.answer };
  }
  if (state.type === "hand_motion" && state.handMotion) {
    return {
      handGestures: state.handMotion.sequence.map((action) => ({
        action,
        durationMs: state.handMotion?.holdMs ?? 0,
      })),
    };
  }
  if (state.type === "speech_wave") {
    return { audioTakes: syntheticTakes() };
  }
  throw new Error(`no alpha.6 evidence helper for ${state.type}`);
}

describe("alpha.6 challenge verification", () => {
  it("verifies the three basic interaction challenges", async () => {
    const built = await buildApp({
      config: makeConfig(),
      logger: false,
      publicDir: mkdtempSync(join(tmpdir(), "oxygenchallenge-empty-")),
    });
    try {
      for (const type of ["human_check", "rotate_align", "semantic_pick"] as const) {
        const created = await createChallenge(built, type);
        const state = stateFor(built, created.challengeId);
        const response = await built.app.inject({
          method: "POST",
          url: `/v1/challenges/${created.challengeId}/verify`,
          payload: evidenceFor(state),
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ verified: true, siteKey: "site_test" });
      }
    } finally {
      await built.app.close();
    }
  });

  it("rejects wrong human dwell and wrong hand motion", async () => {
    const built = await buildApp({
      config: makeConfig(),
      logger: false,
      publicDir: mkdtempSync(join(tmpdir(), "oxygenchallenge-empty-")),
    });
    try {
      const human = await createChallenge(built, "human_check");
      const humanState = stateFor(built, human.challengeId);
      const tooFast = await built.app.inject({
        method: "POST",
        url: `/v1/challenges/${human.challengeId}/verify`,
        payload: { answer: "human", dwellMs: (humanState.humanCheck?.minDwellMs ?? 1) - 1 },
      });
      expect(tooFast.json()).toMatchObject({ verified: false, code: "INVALID_ANSWER" });

      const hand = await createChallenge(built, "hand_motion");
      const handState = stateFor(built, hand.challengeId);
      const wrong = await built.app.inject({
        method: "POST",
        url: `/v1/challenges/${hand.challengeId}/verify`,
        payload: {
          handGestures: [
            {
              action: handState.handMotion?.sequence[0] ?? "open",
              durationMs: (handState.handMotion?.holdMs ?? 1) - 1,
            },
          ],
        },
      });
      expect(wrong.json()).toMatchObject({ verified: false, code: "INVALID_GESTURE" });
    } finally {
      await built.app.close();
    }
  });

  it("compares every requested speech target window", () => {
    for (const template of SPEECH_TEMPLATES) {
      const state = createSpeechWave(template);
      expect(state.focusWindows.map((window) => window.targetWord)).toEqual(
        template.targetWords,
      );
      expect(speechTakesValid(state, syntheticTakes())).toBe(true);
      const identical = syntheticTake(4);
      expect(speechTakesValid(state, [identical, identical, identical])).toBe(false);
    }
  });

  it("accepts a turnstile only through the configured verifier", async () => {
    const verifier = vi.fn(async () => ({ success: true, errorCodes: [] }));
    const built = await buildApp({
      config: makeConfig({
        turnstileSiteKey: "turnstile_site_key",
        turnstileSecretKey: "turnstile_secret",
      }),
      logger: false,
      publicDir: mkdtempSync(join(tmpdir(), "oxygenchallenge-empty-")),
      turnstileVerifier: verifier,
    });
    try {
      const created = await createChallenge(built, "turnstile");
      const response = await built.app.inject({
        method: "POST",
        url: `/v1/challenges/${created.challengeId}/verify`,
        payload: { turnstileToken: "turnstile-token" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ verified: true, siteKey: "site_test" });
      expect(verifier).toHaveBeenCalledOnce();
    } finally {
      await built.app.close();
    }
  });

  it("raises automatically detected risk and derives the larger step count", async () => {
    const built = await buildApp({
      config: makeConfig(),
      logger: false,
      publicDir: mkdtempSync(join(tmpdir(), "oxygenchallenge-empty-")),
    });
    try {
      const response = await built.app.inject({
        method: "POST",
        url: "/v1/challenges",
        headers: {
          origin: "https://app.test",
          "user-agent": "Playwright/1.0",
        },
        payload: {
          siteKey: "site_test",
          action: "submit",
          risk: "low",
        },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<{
        risk: string;
        totalSteps: number;
      }>();
      expect(body.risk).not.toBe("low");
      expect(body.totalSteps).toBeGreaterThanOrEqual(4);
    } finally {
      await built.app.close();
    }
  });
});

describe("alpha.6 risk helpers", () => {
  it("prefers Cloudflare client IP and only upgrades requested risk", () => {
    expect(
      clientIp({
        headers: {
          "cf-connecting-ip": "203.0.113.42",
          "x-forwarded-for": "198.51.100.7",
        },
        ip: "127.0.0.1",
      }),
    ).toBe("203.0.113.42");
    expect(riskFromScore(20)).toBe("medium");
    expect(maxRisk("low", "critical")).toBe("critical");
    expect(maxRisk("high", "medium")).toBe("high");
  });

  it("detects automation and user-agent rotation without blocking normal browsers", () => {
    const tracker = new RiskTracker();
    const baseHeaders = {
      "accept-language": "zh-CN,zh;q=0.9",
      accept: "text/html",
      "sec-fetch-mode": "navigate",
      "sec-ch-ua": '"Chromium";v="140"',
      "cf-ipcountry": "HK",
    };
    const automated = tracker.assess(
      {
        headers: { ...baseHeaders, "user-agent": "Playwright/1.0" },
        ip: "203.0.113.10",
      },
      true,
      "low",
    );
    expect(automated.level).not.toBe("low");
    expect(automated.reasons).toContain("automation-user-agent");

    for (let index = 0; index < 4; index += 1) {
      tracker.assess(
        {
          headers: {
            ...baseHeaders,
            "user-agent": `Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/14${index}.0.0.0 Safari/537.36`,
          },
          ip: "203.0.113.11",
        },
        true,
      );
    }
    const rotated = tracker.assess(
      {
        headers: {
          ...baseHeaders,
          "user-agent": "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
        },
        ip: "203.0.113.11",
      },
      true,
    );
    expect(rotated.reasons).toContain("ip-user-agent-rotation");
  });
});

describe("alpha.8 Turnstile, platform persistence, docs, IP bypass, and legal pages", () => {
  it("advertises API version 1 and rejects incompatible callers", async () => {
    const built = await buildApp({
      config: makeConfig(),
      logger: false,
      publicDir: mkdtempSync(join(tmpdir(), "oxygenchallenge-empty-")),
    });
    try {
      const meta = await built.app.inject({ method: "GET", url: "/v1/meta" });
      expect(meta.statusCode).toBe(200);
      expect(meta.headers["x-oxygen-challenge-api-version"]).toBe("1");
      expect(meta.json()).toMatchObject({ apiVersion: "1", version: "v26.0-alpha.10" });

      const mismatch = await built.app.inject({
        method: "POST",
        url: "/v1/challenges",
        headers: {
          origin: "https://app.test",
          "x-oxygen-challenge-api-version": "3",
        },
        payload: { siteKey: "site_test", action: "submit" },
      });
      expect(mismatch.statusCode).toBe(400);
      expect(mismatch.json()).toEqual({ error: "API_VERSION_MISMATCH" });
    } finally {
      await built.app.close();
    }
  });

  it("requires vNext client context and exposes the v2 risk endpoint", async () => {
    const built = await buildApp({
      config: makeConfig(),
      logger: false,
      publicDir: mkdtempSync(join(tmpdir(), "oxygenchallenge-v2-")),
    });
    try {
      const meta = await built.app.inject({ method: "GET", url: "/v2/meta" });
      expect(meta.statusCode).toBe(200);
      expect(meta.headers["x-oxygen-challenge-api-version"]).toBe("2");
      expect(meta.json()).toMatchObject({
        apiVersion: "2",
        endpoints: {
          challenge: "/v2/challenges",
          riskAssess: "/v2/risk/assess",
        },
      });

      const missing = await built.app.inject({
        method: "POST",
        url: "/v2/challenges",
        headers: { origin: "https://app.test" },
        payload: { siteKey: "site_test", action: "submit" },
      });
      expect(missing.statusCode).toBe(400);
      expect(missing.json()).toMatchObject({ error: "CLIENT_CONTEXT_REQUIRED" });

      const context = {
        timezone: "America/New_York",
        timezoneOffsetMinutes: 300,
        systemLanguage: "en-US",
        languages: ["en-US", "zh-CN"],
        selectedLanguage: "zh-CN",
        webdriver: true,
        screen: { width: 1440, height: 900, pixelRatio: 1 },
      };
      const created = await built.app.inject({
        method: "POST",
        url: "/v2/challenges",
        headers: {
          origin: "https://app.test",
          "cf-ipcountry": "US",
        },
        payload: {
          siteKey: "site_test",
          action: "submit",
          challengeType: "human_check",
          clientContext: context,
        },
      });
      expect(created.statusCode).toBe(200);
      expect(created.headers["x-oxygen-challenge-api-version"]).toBe("2");

      const assessed = await built.app.inject({
        method: "POST",
        url: "/v2/risk/assess",
        headers: {
          origin: "https://app.test",
          "cf-ipcountry": "US",
        },
        payload: {
          siteKey: "site_test",
          action: "submit",
          clientContext: context,
        },
      });
      expect(assessed.statusCode).toBe(200);
      expect(assessed.json()).toMatchObject({
        apiVersion: "2",
        context: {
          timezone: "America/New_York",
          systemLanguage: "en-US",
          selectedLanguage: "zh-CN",
        },
      });
      expect(["high", "critical"]).toContain(assessed.json<{ risk: string }>().risk);
      expect(assessed.json<{ reasons: string[] }>().reasons).toContain(
        "webdriver-detected",
      );
    } finally {
      await built.app.close();
    }
  });

  it("keeps v2 challenge asset URLs on the v2 API surface", async () => {
    const built = await buildApp({
      config: makeConfig(),
      logger: false,
      publicDir: mkdtempSync(join(tmpdir(), "oxygenchallenge-v2-assets-")),
    });
    try {
      const context = {
        timezone: "Asia/Hong_Kong",
        timezoneOffsetMinutes: -480,
        systemLanguage: "zh-HK",
        languages: ["zh-HK", "zh-CN", "en"],
        selectedLanguage: "zh-CN",
        screen: { width: 1440, height: 900, pixelRatio: 2 },
      };
      const created = await built.app.inject({
        method: "POST",
        url: "/v2/challenges",
        headers: { origin: "https://app.test" },
        payload: {
          siteKey: "site_test",
          action: "submit",
          challengeType: "grid_select",
          clientContext: context,
        },
      });
      expect(created.statusCode).toBe(200);
      const challenge = created.json<{
        challengeId: string;
        targetUrl: string;
        tileUrls: string[];
      }>();
      expect(challenge.targetUrl).toContain(
        `/v2/challenges/${challenge.challengeId}/target.svg`,
      );
      expect(challenge.tileUrls).toHaveLength(9);
      for (const tileUrl of challenge.tileUrls) {
        expect(tileUrl).toContain(
          `/v2/challenges/${challenge.challengeId}/tile/`,
        );
      }

      const targetPath = new URL(challenge.targetUrl).pathname;
      const target = await built.app.inject({
        method: "GET",
        url: targetPath,
      });
      expect(target.statusCode).toBe(200);
      expect(target.headers["content-type"]).toContain("image/svg+xml");

      const tilePath = new URL(challenge.tileUrls[0] ?? "").pathname;
      const tile = await built.app.inject({ method: "GET", url: tilePath });
      expect(tile.statusCode).toBe(200);
      expect(tile.headers["content-type"]).toContain("image/svg+xml");
    } finally {
      await built.app.close();
    }
  });

  it("builds multi-step accessible sessions from selected sensory needs", async () => {
    const built = await buildApp({
      config: makeConfig(),
      logger: false,
      publicDir: mkdtempSync(join(tmpdir(), "oxygenchallenge-a11y-")),
    });
    try {
      const response = await built.app.inject({
        method: "POST",
        url: "/v1/challenges",
        headers: { origin: "https://app.test" },
        payload: {
          siteKey: "site_test",
          action: "submit",
          accessible: true,
          accessibilityNeeds: ["vision", "speech"],
          risk: "high",
        },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<{
        type: ChallengeType;
        totalSteps: number;
      }>();
      expect(body.totalSteps).toBe(RISK_STEPS.high);
      expect([
        "human_check",
        "turnstile",
        "semantic_pick",
        "speech_wave",
        "audio_sequence",
      ]).toContain(body.type);

      const allNeeds = await built.app.inject({
        method: "POST",
        url: "/v1/challenges",
        headers: { origin: "https://app.test" },
        payload: {
          siteKey: "site_test",
          action: "submit",
          accessible: true,
          accessibilityNeeds: ["vision", "motor", "hearing", "speech", "cognitive"],
        },
      });
      expect(allNeeds.statusCode).toBe(400);
    } finally {
      await built.app.close();
    }
  });

  it("verifies Turnstile responses and fails closed on network errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyTurnstile("secret", "good", "203.0.113.1")).resolves.toEqual({
      success: true,
      errorCodes: [],
    });
    await expect(verifyTurnstile("secret", "bad")).resolves.toEqual({
      success: false,
      errorCodes: ["invalid-input-response"],
    });
    await expect(verifyTurnstile("secret", "offline")).resolves.toEqual({
      success: false,
      errorCodes: ["verification-unavailable"],
    });
  });

  it("encrypts, rotates, and archives application secrets", async () => {
    const file = temporaryFile("apps.json");
    const key = randomBytes(32);
    const sites: SiteConfig[] = [];
    const store = new PlatformStore(file, key, sites);
    await store.load();
    const created = await store.create(
      { sub: "user-1", name: "Test User" },
      { name: "Example", origins: ["https://app.test"], actions: ["submit"] },
    );
    expect(created.secret).toMatch(/^oc_sec_/);
    expect(sites.find((site) => site.key === created.siteKey)?.secret).toBe(created.secret);
    expect(readFileSync(file, "utf8")).not.toContain(created.secret);
    expect(store.list("user-1")).toHaveLength(1);
    expect(store.list("user-1")[0]).not.toHaveProperty("secret");

    const reloadedSites: SiteConfig[] = [];
    const reloaded = new PlatformStore(file, key, reloadedSites);
    await reloaded.load();
    expect(reloadedSites.find((site) => site.key === created.siteKey)?.secret).toBe(created.secret);

    const rotated = await reloaded.rotate("user-1", created.id);
    expect(rotated?.secret).toMatch(/^oc_sec_/);
    expect(rotated?.secret).not.toBe(created.secret);
    expect(reloadedSites.find((site) => site.key === created.siteKey)?.secret).toBe(
      rotated?.secret,
    );

    await expect(reloaded.archive("user-1", created.id)).resolves.toBe(true);
    expect(reloadedSites.some((site) => site.key === created.siteKey)).toBe(false);
  });

  it("guards the open platform with OIDC session and CSRF checks", async () => {
    const config = makeConfig({
      oxygenAccountIssuer: "https://account.test",
      oxygenAccountClientId: "client-id",
      oxygenAccountClientSecret: "client-secret",
      platformDataKey: randomBytes(32),
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/.well-known/openid-configuration")) {
        return new Response(
          JSON.stringify({
            authorization_endpoint: "https://account.test/authorize",
            token_endpoint: "https://account.test/token",
            userinfo_endpoint: "https://account.test/userinfo",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url === "https://account.test/token") {
        return new Response(JSON.stringify({ access_token: "access-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === "https://account.test/userinfo") {
        return new Response(
          JSON.stringify({
            sub: "user-1",
            name: "Test User",
            email: "user@example.com",
            picture: "https://account.test/avatar.png",
            account_type: "user",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const built = await buildApp({
      config,
      logger: false,
      publicDir: mkdtempSync(join(tmpdir(), "oxygenchallenge-empty-")),
    });
    try {
      const login = await built.app.inject({
        method: "GET",
        url: "/auth/login",
      });
      expect(login.statusCode).toBe(302);
      const authorization = new URL(login.headers.location as string);
      const state = authorization.searchParams.get("state");
      expect(state).toBeTruthy();
      expect(authorization.searchParams.get("api_version")).toBe("2");

      const callback = await built.app.inject({
        method: "GET",
        url: `/auth/callback?code=test-code&state=${encodeURIComponent(state ?? "")}`,
      });
      expect(callback.statusCode).toBe(302);
      const setCookie = callback.headers["set-cookie"];
      const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      expect(cookie).toContain("oc_platform_session=");

      const session = await built.app.inject({
        method: "GET",
        url: "/api/platform/session",
        headers: { cookie: cookie ?? "" },
      });
      expect(session.statusCode).toBe(200);
      const sessionBody = session.json<{ authenticated: boolean; csrf: string }>();
      expect(sessionBody.authenticated).toBe(true);
      expect(session.json()).toMatchObject({
        user: {
          picture: "https://account.test/avatar.png",
        },
      });

      const missingCsrf = await built.app.inject({
        method: "POST",
        url: "/api/platform/apps",
        headers: { cookie: cookie ?? "" },
        payload: {
          name: "Example",
          origins: ["https://app.test"],
          actions: ["submit"],
        },
      });
      expect(missingCsrf.statusCode).toBe(403);

      const created = await built.app.inject({
        method: "POST",
        url: "/api/platform/apps",
        headers: {
          cookie: cookie ?? "",
          "x-csrf-token": sessionBody.csrf,
        },
        payload: {
          name: "Example",
          origins: ["https://app.test"],
          actions: ["submit"],
        },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        name: "Example",
        origins: ["https://app.test"],
        active: true,
      });
      expect(created.json<{ secret: string }>().secret).toMatch(/^oc_sec_/);

      const appId = created.json<{ id: string }>().id;
      const bypass = await built.app.inject({
        method: "POST",
        url: `/api/platform/apps/${appId}/bypass`,
        headers: {
          cookie: cookie ?? "",
          "x-csrf-token": sessionBody.csrf,
        },
        payload: {
          ip: "203.0.113.10",
          durationMinutes: 179,
        },
      });
      expect(bypass.statusCode).toBe(200);
      expect(bypass.json()).toMatchObject({
        ipBypasses: [{ ip: "203.0.113.10" }],
      });

      const tooLong = await built.app.inject({
        method: "POST",
        url: `/api/platform/apps/${appId}/bypass`,
        headers: {
          cookie: cookie ?? "",
          "x-csrf-token": sessionBody.csrf,
        },
        payload: {
          ip: "203.0.113.11",
          durationMinutes: 180,
        },
      });
      expect(tooLong.statusCode).toBe(400);

      const currentIp = await built.app.inject({
        method: "GET",
        url: "/api/platform/ip",
        headers: {
          cookie: cookie ?? "",
          "cf-connecting-ip": "198.51.100.8",
        },
      });
      expect(currentIp.statusCode).toBe(200);
      expect(currentIp.json()).toEqual({ ip: "198.51.100.8" });
    } finally {
      await built.app.close();
    }
  });

  it("expires development IP bypass rules and serves real documentation pages", async () => {
    const file = temporaryFile("bypass-apps.json");
    const key = randomBytes(32);
    const sites: SiteConfig[] = [];
    const store = new PlatformStore(file, key, sites);
    await store.load();
    const created = await store.create(
      { sub: "user-1", name: "Test User" },
      { name: "Bypass App", origins: ["https://app.test"], actions: ["submit"] },
    );

    await expect(store.setIpBypass("user-1", created.id, "bad-ip", 60)).resolves.toBeUndefined();
    await expect(
      store.setIpBypass("user-1", created.id, "203.0.113.10", 180),
    ).resolves.toBeUndefined();
    await expect(
      store.setIpBypass("user-1", created.id, "203.0.113.10", 179),
    ).resolves.toMatchObject({
      ipBypasses: [{ ip: "203.0.113.10" }],
    });
    expect(store.activeIpBypass(created.siteKey, "203.0.113.10")).toBeTruthy();
    expect(store.activeIpBypass(created.siteKey, "203.0.113.11")).toBeUndefined();
    expect(
      store.activeIpBypass(
        created.siteKey,
        "203.0.113.10",
        Date.now() + 180 * 60_000,
      ),
    ).toBeUndefined();
    await expect(
      store.clearIpBypass("user-1", created.id, "203.0.113.10"),
    ).resolves.toMatchObject({ ipBypasses: [] });

    const built = await buildApp({
      config: makeConfig(),
      logger: false,
      publicDir: mkdtempSync(join(tmpdir(), "oxygenchallenge-docs-")),
    });
    try {
      for (const path of ["/docs", "/docs/embed", "/docs/integration", "/docs/platform"]) {
        const response = await built.app.inject({ method: "GET", url: path });
        expect(response.statusCode).toBe(200);
        expect(response.body).toContain("OxygenChallenge");
        expect(response.body).toContain('class="doc-hero"');
        expect(response.body).toContain("docs-language-banner");
      }
      const openapi = await built.app.inject({ method: "GET", url: "/openapi.yaml" });
      expect(openapi.statusCode).toBe(200);
      expect(openapi.body).toContain("version: 26.0.0-alpha.10");
    } finally {
      await built.app.close();
    }
  });

  it("auto-completes a development IP through the existing Challenge API shape", async () => {
    const built = await buildApp({
      config: makeConfig(),
      logger: false,
      publicDir: mkdtempSync(join(tmpdir(), "oxygenchallenge-bypass-")),
    });
    try {
      const createdApp = await built.platformStore.create(
        { sub: "user-1", name: "Test User" },
        { name: "Bypass App", origins: ["https://app.test"], actions: ["submit"] },
      );
      await built.platformStore.setIpBypass(
        "user-1",
        createdApp.id,
        "203.0.113.10",
        60,
      );
      const headers = {
        origin: "https://app.test",
        "cf-connecting-ip": "203.0.113.10",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
      };
      const response = await built.app.inject({
        method: "POST",
        url: "/v1/challenges",
        headers,
        payload: {
          siteKey: createdApp.siteKey,
          action: "submit",
          risk: "critical",
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        type: "human_check",
        totalSteps: 1,
        minDwellMs: 0,
      });
      expect(response.json()).not.toHaveProperty("bypass");

      const verified = await built.app.inject({
        method: "POST",
        url: `/v1/challenges/${response.json<{ challengeId: string }>().challengeId}/verify`,
        payload: { answer: "human", dwellMs: 0 },
      });
      expect(verified.statusCode).toBe(200);
      expect(verified.json()).toMatchObject({
        verified: true,
        action: "submit",
        siteKey: createdApp.siteKey,
      });
      expect(verified.json<{ token: string }>().token).toContain(".");

      const embedded = await built.app.inject({
        method: "GET",
        url: `/embed?sitekey=${encodeURIComponent(createdApp.siteKey)}&action=submit&parentOrigin=${encodeURIComponent("https://app.test")}&launch=1`,
        headers,
      });
      expect(embedded.statusCode).toBe(200);
      expect(embedded.body).toContain('data-bypass="1"');
      expect(embedded.body).toContain('data-challenge-type="human_check"');
    } finally {
      await built.app.close();
    }
  });

  it("serves refined bilingual legal documents with working section anchors", async () => {
    const built = await buildApp({
      config: makeConfig(),
      logger: false,
      publicDir: mkdtempSync(join(tmpdir(), "oxygenchallenge-legal-")),
    });
    try {
      for (const [path, lastSection] of [
        ["/privacy-policy", 12],
        ["/user-agreement", 16],
      ] as const) {
        const response = await built.app.inject({ method: "GET", url: path });
        expect(response.statusCode).toBe(200);
        expect(response.body).toContain('id="legal-language-priority"');
        expect(response.body).toContain("authoritative legal text");
        expect(response.body).toContain(`id="section-${lastSection}"`);
        expect(response.body).toContain("contact@oxygenai.top");
        expect(response.body).not.toContain("support@oxygenai.top");
      }
    } finally {
      await built.app.close();
    }
  });
});
