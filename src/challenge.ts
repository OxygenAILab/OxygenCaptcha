import { randomBytes, randomInt } from "node:crypto";
import type { AnimalSound } from "./audio.js";
import { createGrid } from "./grid.js";
import { createMotion, validMotionPoint } from "./motion.js";
import type {
  AppConfig,
  ChallengeEvidence,
  ChallengeFailure,
  ChallengeReceipt,
  ChallengeState,
  ChallengeType,
  AudioSequenceState,
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

export type VerificationResult =
  | { kind: "verified"; receipt: ChallengeReceipt; state: ChallengeState }
  | { kind: "failed"; failure: ChallengeFailure; state?: ChallengeState };

function sixDigitCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function normalizeAnswer(value: string): string {
  return value.replace(/\D/g, "");
}

function chooseType(requested?: ChallengeType): ChallengeType {
  if (requested) {
    return requested;
  }
  const roll = randomInt(0, 100);
  if (roll < 25) {
    return "grid_select";
  }
  if (roll < 45) {
    return "inverse_occlusion";
  }
  if (roll < 65) {
    return "motion_drag";
  }
  if (roll < 82) {
    return "audio_sequence";
  }
  if (roll < 92) {
    return "calculation";
  }
  return "key_pointer";
}

function sameIndices(actual: number[] | undefined, expected: number[]): boolean {
  if (!actual || actual.length !== expected.length) {
    return false;
  }
  const left = [...new Set(actual)].sort((a, b) => a - b);
  const right = [...expected].sort((a, b) => a - b);
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
  ): ChallengeState {
    this.cleanup();

    const type = accessible ? "inverse_occlusion" : chooseType(requestedType);
    const now = Date.now();
    const common = {
      id: randomBytes(18).toString("base64url"),
      siteKey,
      action,
      type,
      parentOrigin,
      createdAt: now,
      expiresAt: now + this.config.challengeTtlSeconds * 1000,
      attempts: 0,
      maxAttempts: this.config.maxAttempts,
      used: false,
      accessible,
    } as const;

    let state: ChallengeState;
    if (type === "inverse_occlusion") {
      const visibleCode = sixDigitCode();
      let decoyCode = sixDigitCode();
      while (decoyCode === visibleCode) {
        decoyCode = sixDigitCode();
      }
      const palette = PALETTE[randomInt(0, PALETTE.length)] ?? PALETTE[0];
      state = {
        ...common,
        visibleCode,
        decoyCode,
        backgroundColor: palette.background,
        inverseColor: palette.inverse,
      };
    } else if (type === "grid_select") {
      state = { ...common, grid: createGrid() };
    } else if (type === "motion_drag") {
      state = { ...common, motion: createMotion() };
    } else if (type === "audio_sequence") {
      state = { ...common, audioSequence: createAudioSequence() };
    } else if (type === "calculation") {
      state = { ...common, calculation: createCalculation() };
    } else {
      state = {
        ...common,
        keyPointer: {
          requiredDistance: randomInt(150, 221),
          requiredHoldMs: randomInt(650, 951),
        },
      };
    }

    this.challenges.set(state.id, state);
    return state;
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
      state.used = true;
      this.challenges.delete(id);
      return {
        kind: "failed",
        failure: { verified: false, code: "CHALLENGE_EXPIRED" },
        state,
      };
    }

    let passed = false;
    let failure: ChallengeFailure = { verified: false, code: "INVALID_ANSWER" };

    if (state.type === "inverse_occlusion") {
      const normalized = normalizeAnswer(evidence.answer ?? "");
      if (state.decoyCode && normalized === state.decoyCode) {
        state.used = true;
        this.challenges.delete(id);
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
      state.used = true;
      this.challenges.delete(id);
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
          expiresAt: new Date(Date.now() + this.config.tokenTtlSeconds * 1000).toISOString(),
        },
      };
    }

    state.attempts += 1;
    if (state.attempts >= state.maxAttempts) {
      state.used = true;
      this.challenges.delete(id);
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

  private cleanup(): void {
    const now = Date.now();
    for (const [id, state] of this.challenges) {
      if (state.used || state.expiresAt <= now) {
        this.challenges.delete(id);
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
