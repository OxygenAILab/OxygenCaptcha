import { randomBytes, randomInt } from "node:crypto";
import type { AnimalSound } from "./audio.js";
import { validHandMotion } from "./gestures.js";
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
import { createSpeechWave, SPEECH_TEMPLATES, speechTakesValid } from "./speech.js";
import type {
  AppConfig,
  AudioSequenceState,
  ChallengeEvidence,
  ChallengeFailure,
  ChallengePreviewReceipt,
  ChallengeReceipt,
  ChallengeSessionState,
  ChallengeState,
  ChallengeType,
  DeviceClass,
  HandMotionAction,
  KeyPointerState,
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
  { key: "monkey", label: "猴子" },
  { key: "horse", label: "马" },
  { key: "snake", label: "蛇" },
  { key: "bear", label: "熊" },
  { key: "mouse", label: "鼠" },
  { key: "elephant", label: "大象" },
  { key: "seal", label: "海狮" },
];

const SEMANTIC_QUESTIONS = [
  {
    question: "哪一个是会飞的动物？",
    options: [
      { key: "cat", label: "猫" },
      { key: "bird", label: "鸟" },
      { key: "fish", label: "鱼" },
      { key: "dog", label: "狗" },
    ],
    answer: "bird",
  },
  {
    question: "哪一个是水果？",
    options: [
      { key: "carrot", label: "胡萝卜" },
      { key: "apple", label: "苹果" },
      { key: "rice", label: "米饭" },
      { key: "bread", label: "面包" },
    ],
    answer: "apple",
  },
  {
    question: "2 + 3 等于多少？",
    options: [
      { key: "4", label: "4" },
      { key: "5", label: "5" },
      { key: "6", label: "6" },
      { key: "7", label: "7" },
    ],
    answer: "5",
  },
] as const;

const HAND_ACTIONS: HandMotionAction[] = [
  "open",
  "fist",
  "peace",
  "thumb_up",
  "thumb_down",
  "point_up",
  "ok",
  "call_me",
  "l_sign",
  "pinky",
];

const KEY_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "Space", label: "空格" },
  { code: "KeyA", label: "A" },
  { code: "KeyD", label: "D" },
  { code: "KeyF", label: "F" },
  { code: "KeyJ", label: "J" },
  { code: "KeyK", label: "K" },
  { code: "KeyL", label: "L" },
];

export const PUBLIC_PREVIEW_RATIO = 0.02;

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
  "human_check",
  "rotate_align",
  "semantic_pick",
  "turnstile",
  "hand_motion",
  "speech_wave",
];

export const RISK_STEPS: Record<RiskLevel, number> = {
  low: 3,
  medium: 4,
  high: 6,
  critical: 8,
};

export type VerificationResult =
  | { kind: "verified"; receipt: ChallengeReceipt; state: ChallengeState }
  | { kind: "preview"; receipt: ChallengePreviewReceipt; state: ChallengeState }
  | {
      kind: "step";
      state: ChallengeState;
      nextState: ChallengeState;
      session: ChallengeSessionState;
    }
  | { kind: "failed"; failure: ChallengeFailure; state?: ChallengeState };

export type SwapResult =
  | { kind: "swapped"; state: ChallengeState; sessionId?: string }
  | { kind: "failed"; failure: ChallengeFailure };

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

function chooseTypes(
  count: number,
  pool: ChallengeType[],
  requestedType?: ChallengeType,
): ChallengeType[] {
  if (requestedType) {
    return [requestedType];
  }
  const result: ChallengeType[] = [];
  while (result.length < count) {
    const batch = shuffle([...pool]);
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

function createAudioSequence(preview = false): AudioSequenceState {
  const available = preview ? AUDIO_ANIMALS.slice(0, 3) : AUDIO_ANIMALS;
  const animals: AnimalSound[] = [];
  while (animals.length < 4) {
    animals.push(available[randomInt(0, available.length)]?.key ?? "bird");
  }
  const anchor =
    available[randomInt(0, available.length)] ??
    { key: "bird", label: "鸟" };
  const answerPool = available.filter((animal) => animal.key !== anchor.key);
  const answerKey =
    answerPool[randomInt(0, answerPool.length)]?.key ?? "dog";
  const anchorIndex = randomInt(0, 3);
  animals[anchorIndex] = anchor.key;
  animals[anchorIndex + 1] = answerKey;
  const optionKeys = new Set<AnimalSound>([anchor.key, answerKey]);
  for (const animal of shuffle([...available])) {
    if (optionKeys.size >= Math.min(4, available.length)) {
      break;
    }
    optionKeys.add(animal.key);
  }

  return {
    animals,
    answerKey,
    anchorKey: anchor.key,
    anchorLabel: anchor.label,
    options: shuffle(
      available.filter((animal) => optionKeys.has(animal.key)),
    ),
  };
}

function createCalculation(preview = false) {
  if (preview) {
    return { expression: "128 × 37 + 46 × 23", answer: String(128 * 37 + 46 * 23) };
  }
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
    deviceClass: DeviceClass = "desktop",
    preview = false,
  ): ChallengeState {
    this.cleanup();

    const totalSteps = preview || accessible || requestedType
      ? 1
      : (requestedSteps ?? RISK_STEPS[risk]);
    const sessionId = randomBytes(18).toString("base64url");
    const now = Date.now();
    const expiresAt = now + this.config.challengeTtlSeconds * 1000;
    const explicitType =
      deviceClass === "mobile" && requestedType === "key_pointer"
        ? undefined
        : requestedType;
    const types = chooseTypes(
      totalSteps,
      this.availableTypes(deviceClass),
      accessible ? "inverse_occlusion" : explicitType,
    );
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
      deviceClass,
      swapsRemaining: deviceClass === "desktop" ? 1 : 0,
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
        deviceClass,
        preview,
      });
      this.challenges.set(state.id, state);
      session.challengeIds.push(state.id);
    });
    this.sessions.set(session.id, session);
    return this.currentState(session.id) as ChallengeState;
  }

  createPreview(
    siteKey: string,
    action: string,
    parentOrigin: string | null,
    deviceClass: DeviceClass,
    accessible = false,
  ): ChallengeState {
    this.cleanup();
    const type =
      accessible
        ? "inverse_occlusion"
        : chooseTypes(1, this.availableTypes(deviceClass))[0] ??
          "inverse_occlusion";
    const now = Date.now();
    const state = this.createState({
      siteKey,
      action,
      parentOrigin,
      accessible,
      type,
      risk: "low",
      stepIndex: 0,
      totalSteps: 1,
      createdAt: now,
      expiresAt: now + this.config.challengeTtlSeconds * 1000,
      deviceClass,
      preview: true,
    });
    this.challenges.set(state.id, state);
    return state;
  }

  swap(id: string, accessible = false): SwapResult {
    const state = this.challenges.get(id);
    if (!state || state.used || state.expiresAt <= Date.now()) {
      return {
        kind: "failed",
        failure: { verified: false, code: "CHALLENGE_NOT_FOUND" },
      };
    }
    if (
      (!state.preview && !state.swapAllowed && !accessible) ||
      (state.deviceClass ?? "desktop") === "mobile"
    ) {
      return {
        kind: "failed",
        failure: { verified: false, code: "SWAP_NOT_ALLOWED" },
      };
    }

    if (state.preview) {
      this.challenges.delete(id);
      let replacement = this.createPreview(
        state.siteKey,
        state.action,
        state.parentOrigin,
        state.deviceClass ?? "desktop",
        accessible,
      );
      for (
        let attempt = 0;
        !accessible && attempt < 4 && replacement.type === state.type;
        attempt += 1
      ) {
        this.challenges.delete(replacement.id);
        replacement = this.createPreview(
          state.siteKey,
          state.action,
          state.parentOrigin,
          state.deviceClass ?? "desktop",
          accessible,
        );
      }
      return { kind: "swapped", state: replacement };
    }

    const session = state.sessionId ? this.getSession(state.sessionId) : undefined;
    if (!session || session.swapsRemaining <= 0) {
      return {
        kind: "failed",
        failure: { verified: false, code: "SWAP_NOT_ALLOWED" },
      };
    }
    const deviceClass = state.deviceClass ?? "desktop";
    const available = this.availableTypes(deviceClass).filter(
      (type) => type !== state.type,
    );
    const nextType = accessible
      ? "inverse_occlusion"
      : chooseTypes(1, available)[0] ?? state.type;
    const replacement = this.createState({
      siteKey: state.siteKey,
      action: state.action,
      parentOrigin: state.parentOrigin,
      accessible: accessible || state.accessible,
      type: nextType,
      risk: session.risk,
      sessionId: session.id,
      stepIndex: session.currentStep,
      totalSteps: session.totalSteps,
      createdAt: state.createdAt,
      expiresAt: state.expiresAt,
      deviceClass,
      preview: false,
    });
    this.challenges.delete(id);
    this.challenges.set(replacement.id, replacement);
    session.challengeIds[session.currentStep] = replacement.id;
    if (!accessible) {
      session.swapsRemaining -= 1;
    }
    return { kind: "swapped", state: replacement, sessionId: session.id };
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
      passed = Boolean(
        state.motion &&
          evidence.point &&
          validMotionPoint(
            state.motion,
            evidence.point,
            evidence.coverageMs ?? 0,
          ),
      );
      if (!passed) {
        failure = { verified: false, code: "INVALID_POINT" };
      }
    } else if (state.type === "audio_sequence") {
      passed = Boolean(
        state.audioSequence &&
          AUDIO_ANIMALS.some((animal) => animal.key === evidence.answer) &&
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
          validMarketChoice(state.marketTrade, evidence.marketTrades),
      );
      if (!passed) {
        failure = { verified: false, code: "INVALID_POINT" };
      }
    } else if (state.type === "human_check") {
      passed = Boolean(
        state.humanCheck &&
          evidence.answer === "human" &&
          typeof evidence.dwellMs === "number" &&
          evidence.dwellMs >= state.humanCheck.minDwellMs,
      );
    } else if (state.type === "rotate_align") {
      const normalized = ((evidence.angle ?? 999) + 180) % 360 - 180;
      passed = Boolean(
        state.rotateAlign && Math.abs(normalized) <= state.rotateAlign.tolerance,
      );
      if (!passed) {
        failure = { verified: false, code: "INVALID_POINT" };
      }
    } else if (state.type === "semantic_pick") {
      passed = Boolean(
        state.semanticPick && evidence.answer === state.semanticPick.answer,
      );
    } else if (state.type === "turnstile") {
      passed = Boolean(state.turnstile && evidence.turnstilePassed);
    } else if (state.type === "hand_motion") {
      passed = Boolean(
        state.handMotion && validHandMotion(state.handMotion, evidence.handGestures),
      );
      if (!passed) {
        failure = { verified: false, code: "INVALID_GESTURE" };
      }
    } else if (state.type === "speech_wave") {
      passed = Boolean(
        state.speechWave && speechTakesValid(state.speechWave, evidence.audioTakes),
      );
    } else {
      passed = Boolean(
        state.keyPointer &&
          typeof evidence.holdMs === "number" &&
          typeof evidence.distance === "number" &&
          evidence.keyCode === state.keyPointer.requiredKey &&
          evidence.holdMs >= state.keyPointer.requiredHoldMs &&
          evidence.distance >= state.keyPointer.requiredDistance,
      );
      if (!passed) {
        failure = { verified: false, code: "INVALID_GESTURE" };
      }
    }

    if (passed && state.preview) {
      return this.completePreview(state);
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

  private availableTypes(deviceClass: DeviceClass): ChallengeType[] {
    return CHALLENGE_TYPES.filter(
      (type) =>
        (type !== "turnstile" ||
          Boolean(this.config.turnstileSiteKey && this.config.turnstileSecretKey)) &&
        (deviceClass !== "mobile" || type !== "key_pointer"),
    );
  }

  private createState(input: {
    siteKey: string;
    action: string;
    parentOrigin: string | null;
    accessible: boolean;
    type: ChallengeType;
    risk: RiskLevel;
    sessionId?: string;
    stepIndex: number;
    totalSteps: number;
    createdAt: number;
    expiresAt: number;
    deviceClass: DeviceClass;
    preview: boolean;
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
      stepIndex: input.stepIndex,
      totalSteps: input.totalSteps,
      risk: input.risk,
      deviceClass: input.deviceClass,
      preview: input.preview,
      swapAllowed:
        input.preview ||
        (input.deviceClass === "desktop" &&
          (input.type === "hand_motion" ||
            input.type === "speech_wave" ||
            input.type === "turnstile")),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    } as const;

    if (input.type === "inverse_occlusion") {
      const visibleCode = sixDigitCode();
      let decoyCode = sixDigitCode();
      while (decoyCode === visibleCode) {
        decoyCode = sixDigitCode();
      }
      const palette = input.preview
        ? PALETTE[0]
        : PALETTE[randomInt(0, PALETTE.length)] ?? PALETTE[0];
      return {
        ...common,
        visibleCode,
        decoyCode,
        backgroundColor: palette.background,
        inverseColor: palette.inverse,
      };
    }
    if (input.type === "grid_select") {
      return { ...common, grid: createGrid(input.preview) };
    }
    if (input.type === "motion_drag") {
      return {
        ...common,
        motion: createMotion(input.preview ? 2_026_110 : undefined),
      };
    }
    if (input.type === "audio_sequence") {
      return { ...common, audioSequence: createAudioSequence(input.preview) };
    }
    if (input.type === "calculation") {
      return { ...common, calculation: createCalculation(input.preview) };
    }
    if (input.type === "pattern_memory") {
      return {
        ...common,
        patternMemory: createPatternMemory(
          input.preview ? 3 : randomInt(3, 6),
          input.preview ? 202_611 : randomInt(1, 2_147_483_647),
        ),
      };
    }
    if (input.type === "count_flash") {
      return {
        ...common,
        countFlash: createCountFlash(
          input.preview ? 11 : randomInt(1, 2_147_483_647),
        ),
      };
    }
    if (input.type === "market_trade") {
      const mode =
        input.preview || input.risk === "low"
          ? "single"
          : randomInt(0, 2) === 0
            ? "single"
            : "target";
      return {
        ...common,
        marketTrade: createMarketTrade(
          input.preview ? 20_261_107 : randomInt(1, 2_147_483_647),
          mode,
        ),
      };
    }
    if (input.type === "human_check") {
      return {
        ...common,
        humanCheck: {
          minDwellMs: input.preview ? 800 : randomInt(650, 1_200),
        },
      };
    }
    if (input.type === "rotate_align") {
      let initialAngle = input.preview ? -75 : randomInt(-160, 161);
      if (Math.abs(initialAngle) < 25) {
        initialAngle += initialAngle < 0 ? -40 : 40;
      }
      return {
        ...common,
        rotateAlign: {
          initialAngle,
          tolerance: 6,
        },
      };
    }
    if (input.type === "semantic_pick") {
      const semantic =
        SEMANTIC_QUESTIONS[
          input.preview ? 0 : randomInt(0, SEMANTIC_QUESTIONS.length)
        ] ??
        SEMANTIC_QUESTIONS[0];
      return {
        ...common,
        semanticPick: {
          question: semantic.question,
          options: semantic.options.map((option) => ({ ...option })),
          answer: semantic.answer,
        },
      };
    }
    if (input.type === "turnstile") {
      return {
        ...common,
        turnstile: {
          siteKey: this.config.turnstileSiteKey ?? "",
        },
      };
    }
    if (input.type === "hand_motion") {
      const sequence = input.preview
        ? (["open", "peace"] as HandMotionAction[])
        : shuffle([...HAND_ACTIONS]).slice(0, randomInt(2, 4));
      return {
        ...common,
        handMotion: {
          sequence,
          holdMs: 450,
        },
      };
    }
    if (input.type === "speech_wave") {
      const template =
        SPEECH_TEMPLATES[
          input.preview
            ? randomInt(0, Math.max(1, Math.ceil(SPEECH_TEMPLATES.length * PUBLIC_PREVIEW_RATIO)))
            : randomInt(0, SPEECH_TEMPLATES.length)
        ] ??
        SPEECH_TEMPLATES[0];
      return {
        ...common,
        speechWave: createSpeechWave(template as (typeof SPEECH_TEMPLATES)[number]),
      };
    }
    return {
      ...common,
      keyPointer: {
        requiredDistance: input.preview ? 180 : randomInt(150, 221),
        requiredHoldMs: input.preview ? 800 : randomInt(650, 951),
        ...(input.preview
          ? { requiredKey: "Space", requiredKeyLabel: "空格" }
          : (() => {
              const key =
                KEY_OPTIONS[randomInt(0, KEY_OPTIONS.length)] ?? {
                  code: "Space",
                  label: "空格",
                };
              return { requiredKey: key.code, requiredKeyLabel: key.label };
            })()),
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

  private completePreview(state: ChallengeState): VerificationResult {
    state.used = true;
    this.challenges.delete(state.id);
    return {
      kind: "preview",
      state,
      receipt: {
        verified: true,
        preview: true,
        action: state.action,
        siteKey: state.siteKey,
        type: state.type,
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
