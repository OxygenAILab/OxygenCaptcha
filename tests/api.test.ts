import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { motionTarget } from "../src/motion.js";
import type { AppConfig, ChallengeType } from "../src/types.js";

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
    }>();
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
    expect(response.body).not.toMatch(/\b\d{6}\b(?![^<]*<\/span>)/);
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
