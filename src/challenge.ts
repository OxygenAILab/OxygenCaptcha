import { randomBytes, randomInt } from "node:crypto";
import type { AnimalSound } from "./audio.js";
import { createGrid } from "./grid.js";
import {
  createCountFlash,
  createMarketTrade,
  createPatternMemory,
  patternSequence,
  validMarketChoice,
  validPatternSelection,
} from "./microgames.js";
import { createMotion, validMotionPoint } from "./motion.js";
import type {
  AppConfig,
  AudioSequenceState,
  ChallengeEvidence,
  ChallengeFailure,
  ChallengeReceipt,
  ChallengeSessionState,
  ChallengeState,
  ChallengeType,
  RiskLevel,
} from "./types.js";
import type { TokenService } from "./token.js";

const PALETTE = [
  { background: "#0b1f33", inverse: "#f4e0cc" },
  { background: "#111827", inverse: "#eee7d8" },
  { background: "#1f2937", inverse: "#e0d6c8" },
  { background: "#20372b", inverse: "#dfc8d4" },
  { background: "#3c1f33", inverse: "#c3e0cc" },
  { background: "#2f2440", inverse: "#d0dbbf" },
] as const;

const AUDIO_ANIMALS: Array<{ key: AnimalSound; label: string }> = [
  { key: "cat", label: "猫" },
  { key: "dog", label: "狗" },
  { key: "bird", label: "鸟" },
];

const CHALLENGE_TYPES: ChallengeType[] = [
  "grid_select",
  "inverse_occlusion",
  "motion_drag",
  "audio_sequence",
  "calculation",
  "key_pointer",
  "pattern_memory",
  "count_flash",
  "market_trade",
];

export const RISK_STEPS: Record<RiskLevel, number> = {
  low: 3,
  medium: 4,
  high: 6,
  critical: 8,
};

export type VerificationResult =
  | { kind: "verified"; receipt: ChallengeReceipt; state: ChallengeState }
  | {
      kind: "step";
      state: ChallengeState;
      nextState: ChallengeState;
      session: ChallengeSessionState;
    }
  | { kind: "failed"; failure: ChallengeFailure; state?: ChallengeState };

function sixDigitCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function normalizeAnswer(value: string): string {
  return value.replace(/\D/g, "");
}

function sameIndices(actual: number[] | undefined, expected: number[]): boolean {
  if (!actual || actual.length !== expected.length) {
    return false;
  }
  const left = [...new Set(actual)].sort((a, b) => a - b);
  const right = [...new Set(expected)].sort((a, b) => a - b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function shuffle<T>(values: T[]): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swap = randomInt(0, index + 1);
    const current = values[index];
    const other = values[swap];
    if (current !== undefined && other !== undefined) {
      values[index] = other;
      values[swap] = current;
    }
  }
  return values;
}

function chooseTypes(count: number, requestedType?: ChallengeType): ChallengeType[] {
  if (requestedType) {
    return [requestedType];
  }
  const result: ChallengeType[] = [];
  while (result.length < count) {
    const batch = shuffle([...CHALLENGE_TYPES]);
    for (const type of batch) {
      if (result[result.length - 1] === type && batch.length > 1) {
        continue;
      }
      result.push(type);
      if (result.length === count) {
        break;
      }
    }
  }
  return result;
}

function createAudioSequence(): AudioSequenceState {
  const animals: AnimalSound[] = [];
  while (animals.length < 4) {
    animals.push(AUDIO_ANIMALS[randomInt(0, AUDIO_ANIMALS.length)]?.key ?? "bird");
  }
  const catIndex = randomInt(0, 3);
  const answerKey: "dog" | "bird" = randomInt(0, 2) === 0 ? "dog" : "bird";
  animals[catIndex] = "cat";
  animals[catIndex + 1] = answerKey;

  return {
    animals,
    answerKey,
    options: shuffle([...AUDIO_ANIMALS]),
  };
}

function createCalculation() {
  const first = randomInt(120, 990);
  const second = randomInt(17, 89);
  const third = randomInt(23, 99);
  const fourth = randomInt(11, 49);
  return {
    expression: `${first} × ${second} + ${third} × ${fourth}`,
    answer: String(first * second + third * fourth),
  };
}

export class ChallengeStore {
  private readonly challenges = new Map<string, ChallengeState>();
  private readonly sessions = new Map<string, ChallengeSessionState>();

  constructor(
    private readonly config: AppConfig,
    private readonly tokens: TokenService,
  ) {}

  create(
    siteKey: string,
    action: string,
    parentOrigin: string | null,
    accessible = false,
    requestedType?: ChallengeType,
    risk: RiskLevel = "low",
    requestedSteps?: number,
    testMode = false,
  ): ChallengeState {
    this.cleanup();

    const totalSteps = accessible || requestedType ? 1 : (requestedSteps ?? RISK_STEPS[risk]);
    const sessionId = randomBytes(18).toString("base64url");
    const now = Date.now();
    const expiresAt = now + this.config.challengeTtlSeconds * 1000;
    const types = chooseTypes(totalSteps, accessible ? "inverse_occlusion" : requestedType);
    const session: ChallengeSessionState = {
      id: sessionId,
      siteKey,
      action,
      parentOrigin,
      accessible,
      risk,
      challengeIds: [],
      currentStep: 0,
      totalSteps,
      createdAt: now,
      expiresAt,
      completed: false,
      testMode,
    };

    types.forEach((type, stepIndex) => {
      const state = this.createState({
        siteKey,
        action,
        parentOrigin,
        accessible,
        type,
        risk,
        sessionId,
        stepIndex,
        totalSteps,
        createdAt: now,
        expiresAt,
      });
      this.challenges.set(state.id, state);
      session.challengeIds.push(state.id);
    });
    this.sessions.set(session.id, session);
    return this.currentState(session.id) as ChallengeState;
  }

  getSession(id: string): ChallengeSessionState | undefined {
    const session = this.sessions.get(id);
    if (!session) {
      return undefined;
    }
    if (session.completed || session.expiresAt <= Date.now()) {
      this.sessions.delete(id);
      return undefined;
    }
    return session;
  }

  currentState(sessionId: string): ChallengeState | undefined {
    const session = this.getSession(sessionId);
    if (!session) {
      return undefined;
    }
    const id = session.challengeIds[session.currentStep];
    return id ? this.challenges.get(id) : undefined;
  }

  getForAsset(id: string): ChallengeState | undefined {
    const state = this.challenges.get(id);
    if (!state) {
      return undefined;
    }
    if (state.used || state.expiresAt <= Date.now()) {
      this.challenges.delete(id);
      return undefined;
    }
    if (state.sessionId) {
      const session = this.getSession(state.sessionId);
      if (!session || session.challengeIds[session.currentStep] !== id) {
        return undefined;
      }
    }
    return state;
  }

  verify(id: string, evidence: ChallengeEvidence): VerificationResult {
    const state = this.challenges.get(id);
    if (!state) {
      return {
        kind: "failed",
        failure: { verified: false, code: "CHALLENGE_NOT_FOUND" },
      };
    }
    if (state.used) {
      return {
        kind: "failed",
        failure: { verified: false, code: "CHALLENGE_USED" },
        state,
      };
    }
    if (state.expiresAt <= Date.now()) {
      this.abortSession(state);
      return {
        kind: "failed",
        failure: { verified: false, code: "CHALLENGE_EXPIRED" },
        state,
      };
    }
    if (state.sessionId) {
      const session = this.getSession(state.sessionId);
      if (!session || session.challengeIds[session.currentStep] !== id) {
        return {
          kind: "failed",
          failure: { verified: false, code: "CHALLENGE_USED" },
          state,
        };
      }
    }

    let passed = false;
    let failure: ChallengeFailure = { verified: false, code: "INVALID_ANSWER" };

    if (state.type === "inverse_occlusion") {
      const normalized = normalizeAnswer(evidence.answer ?? "");
      if (state.decoyCode && normalized === state.decoyCode) {
        this.abortSession(state);
        return {
          kind: "failed",
          failure: { verified: false, code: "HONEYPOT_TRIGGERED" },
          state,
        };
      }
      passed = Boolean(state.visibleCode && normalized === state.visibleCode);
    } else if (state.type === "grid_select") {
      passed = Boolean(state.grid && sameIndices(evidence.selectedIndices, state.grid.targetIndices));
      if (!passed) {
        failure = { verified: false, code: "INVALID_SELECTION" };
      }
    } else if (state.type === "motion_drag") {
      passed = Boolean(state.motion && evidence.point && validMotionPoint(state.motion, evidence.point));
      if (!passed) {
        failure = { verified: false, code: "INVALID_POINT" };
      }
    } else if (state.type === "audio_sequence") {
      passed = Boolean(
        state.audioSequence &&
          (evidence.answer === "cat" ||
            evidence.answer === "dog" ||
            evidence.answer === "bird") &&
          evidence.answer === state.audioSequence.answerKey,
      );
    } else if (state.type === "calculation") {
      passed = Boolean(
        state.calculation &&
          normalizeAnswer(evidence.answer ?? "") === state.calculation.answer,
      );
    } else if (state.type === "pattern_memory") {
      passed = Boolean(
        state.patternMemory &&
          validPatternSelection(
            evidence.selectedIndices,
            patternSequence(state.patternMemory.seed, state.patternMemory.sequenceLength),
          ),
      );
      if (!passed) {
        failure = { verified: false, code: "INVALID_SELECTION" };
      }
    } else if (state.type === "count_flash") {
      passed = Boolean(
        state.countFlash &&
          normalizeAnswer(evidence.answer ?? "") === String(state.countFlash.count),
      );
    } else if (state.type === "market_trade") {
      passed = Boolean(
        state.marketTrade &&
          evidence.market &&
          validMarketChoice(
            state.marketTrade,
            evidence.market.buyIndex,
            evidence.market.sellIndex,
          ),
      );
      if (!passed) {
        failure = { verified: false, code: "INVALID_POINT" };
      }
    } else {
      passed = Boolean(
        state.keyPointer &&
          typeof evidence.holdMs === "number" &&
          typeof evidence.distance === "number" &&
          evidence.holdMs >= state.keyPointer.requiredHoldMs &&
          evidence.distance >= state.keyPointer.requiredDistance,
      );
      if (!passed) {
        failure = { verified: false, code: "INVALID_GESTURE" };
      }
    }

    if (passed) {
      return this.completeStep(state);
    }

    state.attempts += 1;
    if (state.attempts >= state.maxAttempts) {
      this.abortSession(state);
      return {
        kind: "failed",
        failure: { ...failure, remainingAttempts: 0 },
        state,
      };
    }

    return {
      kind: "failed",
      failure: { ...failure, remainingAttempts: state.maxAttempts - state.attempts },
      state,
    };
  }

  size(): number {
    return this.challenges.size;
  }

  private createState(input: {
    siteKey: string;
    action: string;
    parentOrigin: string | null;
    accessible: boolean;
    type: ChallengeType;
    risk: RiskLevel;
    sessionId: string;
    stepIndex: number;
    totalSteps: number;
    createdAt: number;
    expiresAt: number;
  }): ChallengeState {
    const common = {
      id: randomBytes(18).toString("base64url"),
      siteKey: input.siteKey,
      action: input.action,
      type: input.type,
      parentOrigin: input.parentOrigin,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      attempts: 0,
      maxAttempts: this.config.maxAttempts,
      used: false,
      accessible: input.accessible,
      sessionId: input.sessionId,
      stepIndex: input.stepIndex,
      totalSteps: input.totalSteps,
      risk: input.risk,
    } as const;

    if (input.type === "inverse_occlusion") {
      const visibleCode = sixDigitCode();
      let decoyCode = sixDigitCode();
      while (decoyCode === visibleCode) {
        decoyCode = sixDigitCode();
      }
      const palette = PALETTE[randomInt(0, PALETTE.length)] ?? PALETTE[0];
      return {
        ...common,
        visibleCode,
        decoyCode,
        backgroundColor: palette.background,
        inverseColor: palette.inverse,
      };
    }
    if (input.type === "grid_select") {
      return { ...common, grid: createGrid() };
    }
    if (input.type === "motion_drag") {
      return { ...common, motion: createMotion() };
    }
    if (input.type === "audio_sequence") {
      return { ...common, audioSequence: createAudioSequence() };
    }
    if (input.type === "calculation") {
      return { ...common, calculation: createCalculation() };
    }
    if (input.type === "pattern_memory") {
      return {
        ...common,
        patternMemory: createPatternMemory(
          randomInt(3, 6),
          randomInt(1, 2_147_483_647),
        ),
      };
    }
    if (input.type === "count_flash") {
      return {
        ...common,
        countFlash: createCountFlash(randomInt(1, 2_147_483_647)),
      };
    }
    if (input.type === "market_trade") {
      return {
        ...common,
        marketTrade: createMarketTrade(randomInt(1, 2_147_483_647)),
      };
    }
    return {
      ...common,
      keyPointer: {
        requiredDistance: randomInt(150, 221),
        requiredHoldMs: randomInt(650, 951),
      },
    };
  }

  private completeStep(state: ChallengeState): VerificationResult {
    state.used = true;
    this.challenges.delete(state.id);
    const session = state.sessionId ? this.getSession(state.sessionId) : undefined;
    if (!session) {
      return {
        kind: "failed",
        failure: { verified: false, code: "CHALLENGE_EXPIRED" },
        state,
      };
    }

    session.currentStep += 1;
    if (session.currentStep < session.totalSteps) {
      const nextState = this.currentState(session.id);
      if (!nextState) {
        this.sessions.delete(session.id);
        return {
          kind: "failed",
          failure: { verified: false, code: "CHALLENGE_EXPIRED" },
          state,
        };
      }
      return { kind: "step", state, nextState, session };
    }

    session.completed = true;
    this.sessions.delete(session.id);
    const token = this.tokens.issue({
      siteKey: state.siteKey,
      action: state.action,
      assuranceLevel: "A1",
    });
    return {
      kind: "verified",
      state,
      receipt: {
        verified: true,
        token,
        assuranceLevel: "A1",
        action: state.action,
        siteKey: state.siteKey,
        sessionId: session.id,
        risk: session.risk,
        stepsCompleted: session.totalSteps,
        expiresAt: new Date(Date.now() + this.config.tokenTtlSeconds * 1000).toISOString(),
      },
    };
  }

  private abortSession(state: ChallengeState): void {
    state.used = true;
    this.challenges.delete(state.id);
    if (!state.sessionId) {
      return;
    }
    const session = this.sessions.get(state.sessionId);
    if (!session) {
      return;
    }
    for (const challengeId of session.challengeIds) {
      const challenge = this.challenges.get(challengeId);
      if (challenge) {
        challenge.used = true;
        this.challenges.delete(challengeId);
      }
    }
    session.completed = true;
    this.sessions.delete(session.id);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, state] of this.challenges) {
      if (state.used || state.expiresAt <= now) {
        this.challenges.delete(id);
      }
    }
    for (const [id, session] of this.sessions) {
      if (session.completed || session.expiresAt <= now) {
        this.sessions.delete(id);
      }
    }

    while (this.challenges.size >= 50_000) {
      const oldest = this.challenges.keys().next().value as string | undefined;
      if (!oldest) {
        break;
      }
      this.challenges.delete(oldest);
    }
  }
}
