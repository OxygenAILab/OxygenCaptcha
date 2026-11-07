import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { RISK_STEPS } from "../src/challenge.js";
import {
  countFromSeed,
  extremeIndices,
  patternSequence,
} from "../src/microgames.js";
import { motionTarget } from "../src/motion.js";
import type {
  AppConfig,
  ChallengeEvidence,
  ChallengeState,
  ChallengeType,
  RiskLevel,
} from "../src/types.js";

const testConfig: AppConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 8787,
  publicOrigin: "https://challenge.test",
  challengeTtlSeconds: 60,
  tokenTtlSeconds: 60,
  maxAttempts: 3,
  rateLimitMax: 1000,
  tokenSeed: randomBytes(32),
  platformDataFile: join(tmpdir(), `oxygenchallenge-platform-${randomBytes(8).toString("hex")}.json`),
  sites: [
    {
      key: "site_test",
      secret: "site_test_secret_value",
      origins: ["https://app.test"],
      actions: ["submit", "signup"],
    },
  ],
};

describe("OxygenChallenge API", () => {
  let app: FastifyInstance;
  let challenges: Awaited<ReturnType<typeof buildApp>>["challenges"];

  beforeAll(async () => {
    const built = await buildApp({
      config: testConfig,
      logger: false,
      publicDir: mkdtempSync(join(tmpdir(), "oxygenchallenge-empty-")),
    });
    app = built.app;
    challenges = built.challenges;
  });

  afterAll(async () => {
    await app.close();
  });

  async function create(
    challengeType: ChallengeType,
    siteKey = "site_test",
    action = "submit",
    accessible = false,
  ) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/challenges",
      headers: { origin: "https://app.test" },
      payload: { siteKey, action, accessible, challengeType },
    });
    expect(response.statusCode).toBe(200);
    return response.json<{
      challengeId: string;
      type: ChallengeType;
      decoyText?: string;
      overlayUrl?: string;
      targetUrl?: string;
      tileUrls?: string[];
      motion?: { width: number; height: number; seed: number; durationMs: number };
      audioUrl?: string;
      options?: Array<{ key: string; label: string }>;
      expression?: string;
      requiredDistance?: number;
      requiredHoldMs?: number;
      sessionId?: string;
      step?: number;
      totalSteps?: number;
      risk?: RiskLevel;
      pattern?: { seed: number; sequenceLength: number };
      countFlash?: { seed: number; revealMs: number };
      market?: { seed: number; width: number; height: number };
    }>();
  }

  async function createSession(risk: RiskLevel) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/challenges",
      headers: { origin: "https://app.test" },
      payload: { siteKey: "site_test", action: "submit", risk },
    });
    expect(response.statusCode).toBe(200);
    return response.json<{
      challengeId: string;
      sessionId: string;
      step: number;
      totalSteps: number;
      risk: RiskLevel;
      type: ChallengeType;
    }>();
  }

  function evidenceFor(state: ChallengeState): ChallengeEvidence {
    if (state.type === "inverse_occlusion") {
      if (!state.visibleCode) {
        throw new Error("inverse state missing");
      }
      return { answer: state.visibleCode };
    }
    if (state.type === "grid_select") {
      if (!state.grid) {
        throw new Error("grid state missing");
      }
      return { selectedIndices: state.grid.targetIndices };
    }
    if (state.type === "motion_drag" && state.motion) {
      return { point: { ...motionTarget(state.motion, 1_200), elapsedMs: 1_200 } };
    }
    if (state.type === "audio_sequence") {
      if (!state.audioSequence) {
        throw new Error("audio state missing");
      }
      return { answer: state.audioSequence.answerKey };
    }
    if (state.type === "calculation") {
      if (!state.calculation) {
        throw new Error("calculation state missing");
      }
      return { answer: state.calculation.answer };
    }
    if (state.type === "key_pointer" && state.keyPointer) {
      return {
        holdMs: state.keyPointer.requiredHoldMs,
        distance: state.keyPointer.requiredDistance,
      };
    }
    if (state.type === "pattern_memory" && state.patternMemory) {
      return {
        selectedIndices: patternSequence(
          state.patternMemory.seed,
          state.patternMemory.sequenceLength,
        ),
      };
    }
    if (state.type === "count_flash" && state.countFlash) {
      return { answer: String(countFromSeed(state.countFlash.seed)) };
    }
    if (state.type === "market_trade" && state.marketTrade) {
      const extremes = extremeIndices(state.marketTrade.prices);
      return {
        market: {
          buyIndex: state.marketTrade.buyIndex ?? extremes.low,
          sellIndex: state.marketTrade.sellIndex ?? extremes.high,
        },
      };
    }
    if (state.type === "human_check" && state.humanCheck) {
      return { answer: "human", dwellMs: state.humanCheck.minDwellMs };
    }
    if (state.type === "rotate_align") {
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
      return { audioTakes: syntheticSpeechTakes() };
    }
    throw new Error(`No evidence helper for ${state.type}`);
  }

  function syntheticSpeechTakes(): number[][][] {
    const take = (takeIndex: number) =>
      Array.from({ length: 96 }, (_, frame) =>
        Array.from({ length: 7 }, (_, band) => {
          const signal = Math.sin(
            frame * (0.07 + band * 0.013) + takeIndex * 1.7 + band * 0.9,
          );
          const jitter = ((((frame * 17 + band * 31 + takeIndex * 13) % 23) - 11) / 220);
          return 0.5 + signal * 0.24 + jitter;
        }),
      );
    return [1, 2, 3].map((index) => take(index));
  }

  it("creates an inverse-occlusion challenge with hidden decoy and path-only overlay", async () => {
    const body = await create("inverse_occlusion");
    expect(body.type).toBe("inverse_occlusion");
    const state = challenges.getForAsset(body.challengeId);
    expect(state).toBeDefined();
    expect(body.decoyText).toMatch(/^\d{6}$/);
    expect(body.decoyText).not.toBe(state?.visibleCode);

    const overlay = await app.inject({
      method: "GET",
      url: `/v1/challenges/${body.challengeId}/overlay.svg`,
    });
    expect(overlay.statusCode).toBe(200);
    expect(overlay.headers["content-type"]).toContain("image/svg+xml");
    expect(overlay.body).not.toContain("<text");
    expect(overlay.body).not.toContain(state?.visibleCode ?? "");
    expect(overlay.body).not.toContain("<rect");
    expect(overlay.body).toContain("<path");
  });

  it("passes the correct visible code and rejects token replay", async () => {
    const body = await create("inverse_occlusion");
    const state = challenges.getForAsset(body.challengeId);
    expect(state).toBeDefined();

    const verification = await app.inject({
      method: "POST",
      url: `/v1/challenges/${body.challengeId}/verify`,
      payload: { answer: state?.visibleCode },
    });
    expect(verification.statusCode).toBe(200);
    const receipt = verification.json<{ verified: boolean; token: string }>();
    expect(receipt.verified).toBe(true);

    const siteverify = await app.inject({
      method: "POST",
      url: "/v1/siteverify",
      payload: { secret: testConfig.sites[0]?.secret, response: receipt.token },
    });
    expect(siteverify.statusCode).toBe(200);
    expect(siteverify.json()).toMatchObject({ success: true, siteKey: "site_test" });

    const replay = await app.inject({
      method: "POST",
      url: "/v1/siteverify",
      payload: { secret: testConfig.sites[0]?.secret, response: receipt.token },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ success: false, errorCodes: ["TOKEN_REPLAYED"] });
  });

  it("treats the same-color decoy as a bot signal but returns a generic failure", async () => {
    const body = await create("inverse_occlusion");
    const response = await app.inject({
      method: "POST",
      url: `/v1/challenges/${body.challengeId}/verify`,
      payload: { answer: body.decoyText },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ verified: false, code: "INVALID_ANSWER" });
  });

  it("renders a server-side embed with the decoy in HTML and visible digits only in the image", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/embed?sitekey=site_test&action=submit&parentOrigin=https%3A%2F%2Fapp.test&challengeType=inverse_occlusion",
      headers: { referer: "https://app.test/form" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain('class="oc-decoy"');
    expect(response.body).toContain("/overlay.svg");
    expect(response.body).toContain("/frame.js");
    const challengeId = response.body.match(/data-challenge-id="([^"]+)"/)?.[1];
    const state = challengeId ? challenges.getForAsset(challengeId) : undefined;
    expect(state?.visibleCode).toBeTruthy();
    expect(response.body).not.toContain(state?.visibleCode);
    const visibleSixDigit = [...response.body.matchAll(/\b\d{6}\b/g)].map(
      (match) => match[0],
    );
    expect(visibleSixDigit).toContain(state?.decoyCode);
  });

  it("serves a WAV accessibility fallback", async () => {
    const body = await create("inverse_occlusion");
    const response = await app.inject({
      method: "GET",
      url: `/v1/challenges/${body.challengeId}/audio.wav`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("audio/wav");
    expect(response.rawPayload.subarray(0, 4).toString()).toBe("RIFF");
  });

  it("forces the inverse-occlusion fallback when accessible mode is requested", async () => {
    const body = await create("grid_select", "site_test", "submit", true);
    expect(body.type).toBe("inverse_occlusion");
    expect(body.totalSteps).toBe(1);
  });

  it("serves a nine-tile grid without leaking target indices", async () => {
    const body = await create("grid_select");
    const state = challenges.getForAsset(body.challengeId);
    expect(body.type).toBe("grid_select");
    expect(body.tileUrls).toHaveLength(9);
    expect(body.targetUrl).toContain("/target.svg");
    expect(state?.grid?.targetIndices.length).toBeGreaterThanOrEqual(2);
    expect(body).not.toHaveProperty("targetIndices");

    const target = await app.inject({
      method: "GET",
      url: `/v1/challenges/${body.challengeId}/target.svg`,
    });
    expect(target.statusCode).toBe(200);
    expect(target.headers["content-type"]).toContain("image/svg+xml");

    const tile = await app.inject({
      method: "GET",
      url: `/v1/challenges/${body.challengeId}/tile/0.svg`,
    });
    expect(tile.statusCode).toBe(200);
    expect(tile.body).toContain("<svg");
  });

  it("rejects an incomplete grid selection and accepts the exact target indices", async () => {
    const body = await create("grid_select");
    const state = challenges.getForAsset(body.challengeId);
    const targetIndices = state?.grid?.targetIndices ?? [];

    const wrong = await app.inject({
      method: "POST",
      url: `/v1/challenges/${body.challengeId}/verify`,
      payload: { selectedIndices: targetIndices.slice(0, -1) },
    });
    expect(wrong.statusCode).toBe(200);
    expect(wrong.json()).toMatchObject({ verified: false, code: "INVALID_SELECTION" });

    const correct = await app.inject({
      method: "POST",
      url: `/v1/challenges/${body.challengeId}/verify`,
      payload: { selectedIndices: targetIndices },
    });
    expect(correct.statusCode).toBe(200);
    expect(correct.json()).toMatchObject({ verified: true, siteKey: "site_test" });
  });

  it("validates a server-derived point for the moving-target challenge", async () => {
    const body = await create("motion_drag");
    const state = challenges.getForAsset(body.challengeId);
    expect(body.type).toBe("motion_drag");
    expect(state?.motion).toBeDefined();
    if (!state?.motion) {
      throw new Error("motion state missing");
    }

    const point = { ...motionTarget(state.motion, 1_200), elapsedMs: 1_200 };
    const response = await app.inject({
      method: "POST",
      url: `/v1/challenges/${body.challengeId}/verify`,
      payload: { point },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ verified: true, siteKey: "site_test" });
  });

  it("serves an animal audio sequence without exposing the answer in JSON", async () => {
    const body = await create("audio_sequence");
    const state = challenges.getForAsset(body.challengeId);
    expect(body.type).toBe("audio_sequence");
    expect(body.options).toHaveLength(3);
    expect(body.audioUrl).toContain("/sequence.wav");
    expect(body).not.toHaveProperty("answerKey");
    expect(state?.audioSequence?.animals).toContain("cat");

    const audio = await app.inject({
      method: "GET",
      url: `/v1/challenges/${body.challengeId}/sequence.wav`,
    });
    expect(audio.statusCode).toBe(200);
    expect(audio.headers["content-type"]).toContain("audio/wav");
    expect(audio.rawPayload.subarray(0, 4).toString()).toBe("RIFF");

    const answer = state?.audioSequence?.answerKey;
    const correct = await app.inject({
      method: "POST",
      url: `/v1/challenges/${body.challengeId}/verify`,
      payload: { answer },
    });
    expect(correct.statusCode).toBe(200);
    expect(correct.json()).toMatchObject({ verified: true, siteKey: "site_test" });
  });

  it("keeps the calculation answer server-side and verifies an integer result", async () => {
    const body = await create("calculation");
    const state = challenges.getForAsset(body.challengeId);
    expect(body.type).toBe("calculation");
    expect(body.expression).toContain("×");
    expect(body).not.toHaveProperty("answer");

    const response = await app.inject({
      method: "POST",
      url: `/v1/challenges/${body.challengeId}/verify`,
      payload: { answer: state?.calculation?.answer },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ verified: true, siteKey: "site_test" });
  });

  it("requires both the minimum hold time and drag distance for key-pointer", async () => {
    const body = await create("key_pointer");
    const state = challenges.getForAsset(body.challengeId);
    expect(body.type).toBe("key_pointer");
    expect(body.requiredDistance).toBeGreaterThanOrEqual(150);
    expect(body.requiredHoldMs).toBeGreaterThanOrEqual(650);
    if (!state?.keyPointer) {
      throw new Error("key pointer state missing");
    }

    const tooFast = await app.inject({
      method: "POST",
      url: `/v1/challenges/${body.challengeId}/verify`,
      payload: {
        holdMs: state.keyPointer.requiredHoldMs - 1,
        distance: state.keyPointer.requiredDistance,
      },
    });
    expect(tooFast.statusCode).toBe(200);
    expect(tooFast.json()).toMatchObject({ verified: false, code: "INVALID_GESTURE" });

    const correct = await app.inject({
      method: "POST",
      url: `/v1/challenges/${body.challengeId}/verify`,
      payload: {
        holdMs: state.keyPointer.requiredHoldMs,
        distance: state.keyPointer.requiredDistance,
      },
    });
    expect(correct.statusCode).toBe(200);
    expect(correct.json()).toMatchObject({ verified: true, siteKey: "site_test" });
  });

  it("validates a pattern-memory sequence without serializing it", async () => {
    const body = await create("pattern_memory");
    const state = challenges.getForAsset(body.challengeId);
    expect(body.type).toBe("pattern_memory");
    expect(body.pattern?.sequenceLength).toBeGreaterThanOrEqual(3);
    expect(body).not.toHaveProperty("sequence");
    if (!state?.patternMemory) {
      throw new Error("pattern state missing");
    }
    const sequence = patternSequence(
      state.patternMemory.seed,
      state.patternMemory.sequenceLength,
    );
    const response = await app.inject({
      method: "POST",
      url: `/v1/challenges/${body.challengeId}/verify`,
      payload: { selectedIndices: sequence },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ verified: true, siteKey: "site_test" });
  });

  it("validates a transient count without exposing the count in JSON", async () => {
    const body = await create("count_flash");
    const state = challenges.getForAsset(body.challengeId);
    expect(body.type).toBe("count_flash");
    expect(body.countFlash?.revealMs).toBeGreaterThanOrEqual(800);
    expect(body).not.toHaveProperty("count");
    if (!state?.countFlash) {
      throw new Error("count state missing");
    }
    const response = await app.inject({
      method: "POST",
      url: `/v1/challenges/${body.challengeId}/verify`,
      payload: { answer: String(state.countFlash.count) },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ verified: true, siteKey: "site_test" });
  });

  it("validates a buy-low sell-high market interaction", async () => {
    const body = await create("market_trade");
    const state = challenges.getForAsset(body.challengeId);
    expect(body.type).toBe("market_trade");
    expect(body.market?.width).toBe(360);
    expect(body).not.toHaveProperty("buyIndex");
    if (!state?.marketTrade) {
      throw new Error("market state missing");
    }
    const response = await app.inject({
      method: "POST",
      url: `/v1/challenges/${body.challengeId}/verify`,
      payload: {
        market: {
          buyIndex: state.marketTrade.buyIndex,
          sellIndex: state.marketTrade.sellIndex,
        },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ verified: true, siteKey: "site_test" });
  });

  it("issues a token only after all medium-risk session steps pass", async () => {
    const first = await createSession("medium");
    expect(first.totalSteps).toBe(4);
    expect(first.step).toBe(1);
    expect(first.risk).toBe("medium");

    let challengeId = first.challengeId;
    for (let step = 1; step <= 4; step += 1) {
      const state = challenges.getForAsset(challengeId);
      expect(state).toBeDefined();
      if (!state) {
        throw new Error("session challenge state missing");
      }
      const response = await app.inject({
        method: "POST",
        url: `/v1/challenges/${challengeId}/verify`,
        payload: evidenceFor(state),
      });
      expect(response.statusCode).toBe(200);
      const result = response.json<{
        verified: boolean;
        token?: string;
        stepPassed?: boolean;
        nextChallenge?: { challengeId: string };
        stepsCompleted?: number;
      }>();
      if (step < 4) {
        expect(result.verified).toBe(false);
        expect(result.stepPassed).toBe(true);
        expect(result).not.toHaveProperty("token");
        expect(result.nextChallenge?.challengeId).toBeTruthy();
        challengeId = result.nextChallenge?.challengeId ?? "";
      } else {
        expect(result.verified).toBe(true);
        expect(result.stepsCompleted).toBe(4);
        expect(result.token).toContain(".");
      }
    }
  });

  it("uses the risk-derived step count and keeps explicit types single-step", async () => {
    const defaultSession = await app.inject({
      method: "POST",
      url: "/v1/challenges",
      headers: { origin: "https://app.test" },
      payload: { siteKey: "site_test", action: "submit" },
    });
    expect(defaultSession.statusCode).toBe(200);
    const session = defaultSession.json<{ risk: RiskLevel; step: number; totalSteps: number }>();
    expect(session.step).toBe(1);
    expect(session.totalSteps).toBe(RISK_STEPS[session.risk]);

    const explicit = await create("grid_select");
    expect(explicit).toMatchObject({ step: 1, totalSteps: 1 });
  });

  it("maps high and critical risk to six and eight steps", async () => {
    const high = await createSession("high");
    const critical = await createSession("critical");
    expect(high.totalSteps).toBe(RISK_STEPS.high);
    expect(critical.totalSteps).toBe(RISK_STEPS.critical);
  });

  it("rejects missing and disallowed origins", async () => {
    const missing = await app.inject({
      method: "POST",
      url: "/v1/challenges",
      payload: { siteKey: "site_test", action: "submit" },
    });
    expect(missing.statusCode).toBe(403);

    const wrong = await app.inject({
      method: "POST",
      url: "/v1/challenges",
      headers: { origin: "https://evil.test" },
      payload: { siteKey: "site_test", action: "submit" },
    });
    expect(wrong.statusCode).toBe(403);
  });

  it("does not enable browser test instrumentation in production embeds", async () => {
    const production = await buildApp({
      config: { ...testConfig, nodeEnv: "production" },
      logger: false,
      publicDir: mkdtempSync(join(tmpdir(), "oxygenchallenge-production-")),
    });
    try {
      const response = await production.app.inject({
        method: "GET",
        url: "/embed?sitekey=site_test&action=submit&parentOrigin=https%3A%2F%2Fapp.test&challengeType=motion_drag&test=1",
        headers: { referer: "https://app.test/form" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('data-test-mode="0"');
      expect(response.body).not.toContain('data-test-mode="1"');
    } finally {
      await production.app.close();
    }
  });
});
