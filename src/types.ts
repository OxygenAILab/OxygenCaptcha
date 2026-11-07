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
  turnstileSiteKey?: string;
  turnstileSecretKey?: string;
  platformDataFile: string;
  platformDataKey?: Buffer;
  oxygenAccountIssuer?: string;
  oxygenAccountClientId?: string;
  oxygenAccountClientSecret?: string;
};

export type ChallengeType =
  | "inverse_occlusion"
  | "grid_select"
  | "motion_drag"
  | "audio_sequence"
  | "calculation"
  | "key_pointer"
  | "pattern_memory"
  | "count_flash"
  | "market_trade"
  | "human_check"
  | "rotate_align"
  | "semantic_pick"
  | "turnstile"
  | "hand_motion"
  | "speech_wave";

export type RiskLevel = "low" | "medium" | "high" | "critical";

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

export type PatternMemoryState = {
  seed: number;
  sequenceLength: number;
};

export type CountFlashState = {
  seed: number;
  count: number;
  revealMs: number;
};

export type MarketTradeState = {
  seed: number;
  width: number;
  height: number;
  prices: number[];
  buyIndex: number;
  sellIndex: number;
};

export type HumanCheckState = {
  minDwellMs: number;
};

export type RotateAlignState = {
  initialAngle: number;
  tolerance: number;
};

export type SemanticPickState = {
  question: string;
  options: Array<{ key: string; label: string }>;
  answer: string;
};

export type TurnstileState = {
  siteKey: string;
};

export type HandMotionAction = "open" | "fist" | "peace";

export type HandMotionState = {
  sequence: HandMotionAction[];
  holdMs: number;
};

export type SpeechWaveState = {
  phrase: string;
  targetWords: string[];
  focusWindows: Array<{
    targetWord: string;
    start: number;
    end: number;
  }>;
  focusStart: number;
  focusEnd: number;
  takeCount: number;
};

export type ChallengeEvidence = {
  answer?: string;
  selectedIndices?: number[];
  holdMs?: number;
  distance?: number;
  dwellMs?: number;
  angle?: number;
  turnstilePassed?: boolean;
  handGestures?: Array<{
    action: HandMotionAction;
    durationMs: number;
  }>;
  audioTakes?: number[][][];
  market?: {
    buyIndex: number;
    sellIndex: number;
  };
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
  patternMemory?: PatternMemoryState;
  countFlash?: CountFlashState;
  marketTrade?: MarketTradeState;
  humanCheck?: HumanCheckState;
  rotateAlign?: RotateAlignState;
  semanticPick?: SemanticPickState;
  turnstile?: TurnstileState;
  handMotion?: HandMotionState;
  speechWave?: SpeechWaveState;
  sessionId?: string;
  stepIndex?: number;
  totalSteps?: number;
  risk?: RiskLevel;
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
  sessionId: string;
  risk: RiskLevel;
  stepsCompleted: number;
  expiresAt: string;
};

export type ChallengeSessionState = {
  id: string;
  siteKey: string;
  action: string;
  parentOrigin: string | null;
  accessible: boolean;
  risk: RiskLevel;
  challengeIds: string[];
  currentStep: number;
  totalSteps: number;
  createdAt: number;
  expiresAt: number;
  completed: boolean;
  testMode: boolean;
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
