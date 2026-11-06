export type SiteConfig = {
  key: string;
  secret: string;
  origins: string[];
  actions: string[];
};

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  publicOrigin: string;
  challengeTtlSeconds: number;
  tokenTtlSeconds: number;
  maxAttempts: number;
  rateLimitMax: number;
  sites: SiteConfig[];
  tokenSeed?: Buffer;
};

export type ChallengeType =
  | "inverse_occlusion"
  | "grid_select"
  | "motion_drag"
  | "audio_sequence"
  | "calculation"
  | "key_pointer";

export type GridState = {
  itemKeys: string[];
  targetKey: string;
  targetName: string;
  targetIndices: number[];
};

export type MotionState = {
  seed: number;
  width: number;
  height: number;
  durationMs: number;
};

export type AudioSequenceState = {
  animals: Array<"cat" | "dog" | "bird">;
  answerKey: "cat" | "dog" | "bird";
  options: Array<{ key: "cat" | "dog" | "bird"; label: string }>;
};

export type CalculationState = {
  expression: string;
  answer: string;
};

export type KeyPointerState = {
  requiredDistance: number;
  requiredHoldMs: number;
};

export type ChallengeEvidence = {
  answer?: string;
  selectedIndices?: number[];
  holdMs?: number;
  distance?: number;
  point?: {
    x: number;
    y: number;
    elapsedMs: number;
  };
};

export type ChallengeState = {
  id: string;
  siteKey: string;
  action: string;
  type: ChallengeType;
  visibleCode?: string;
  decoyCode?: string;
  backgroundColor?: string;
  inverseColor?: string;
  grid?: GridState;
  motion?: MotionState;
  audioSequence?: AudioSequenceState;
  calculation?: CalculationState;
  keyPointer?: KeyPointerState;
  parentOrigin: string | null;
  createdAt: number;
  expiresAt: number;
  attempts: number;
  maxAttempts: number;
  used: boolean;
  accessible: boolean;
};

export type ChallengeReceipt = {
  verified: true;
  token: string;
  assuranceLevel: "A1";
  action: string;
  siteKey: string;
  expiresAt: string;
};

export type ChallengeFailure = {
  verified: false;
  code:
    | "INVALID_ANSWER"
    | "INVALID_SELECTION"
    | "INVALID_POINT"
    | "INVALID_GESTURE"
    | "HONEYPOT_TRIGGERED"
    | "ATTEMPTS_EXHAUSTED"
    | "CHALLENGE_EXPIRED"
    | "CHALLENGE_USED"
    | "CHALLENGE_NOT_FOUND";
  remainingAttempts?: number;
};
