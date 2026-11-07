import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { renderAnimalSequenceWave, renderDtmfWave } from "./audio.js";
import { ChallengeStore, RISK_STEPS, type VerificationResult } from "./challenge.js";
import { loadConfig } from "./config.js";
import { renderGridItemSvg, renderTargetSvg } from "./grid.js";
import { registerPlatform } from "./platform.js";
import { PlatformStore } from "./platform-store.js";
import { legalPageHtml } from "./legal.js";
import { clientIp, RiskTracker } from "./risk.js";
import { renderChallengeSvg } from "./render.js";
import {
  getSite,
  requestOrigin,
  secretsMatch,
  siteAllowsAction,
  siteAllowsOrigin,
} from "./site.js";
import { TokenService } from "./token.js";
import type { AppConfig, ChallengeState, HandMotionAction } from "./types.js";
import { officialSiteHtml } from "./web.js";
import { verifyTurnstile } from "./turnstile.js";

const CHALLENGE_TYPES = [
  "inverse_occlusion",
  "grid_select",
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
] as const;

const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
const API_VERSION = "1";

const createSchema = z.object({
  siteKey: z.string().min(3).max(128),
  action: z.string().min(1).max(64).default("submit"),
  accessible: z.boolean().default(false),
  challengeType: z.enum(CHALLENGE_TYPES).optional(),
  risk: z.enum(RISK_LEVELS).optional(),
  steps: z.number().int().min(1).max(8).optional(),
});

const verifySchema = z.object({
  answer: z.string().max(32).optional(),
  selectedIndices: z.array(z.number().int().min(0).max(8)).max(9).optional(),
  holdMs: z.number().int().min(0).max(9_000).optional(),
  distance: z.number().min(0).max(1_200).optional(),
  keyCode: z.string().min(1).max(32).optional(),
  coverageMs: z.number().int().min(0).max(30_000).optional(),
  marketTrades: z
    .array(
      z.object({
        buyIndex: z.number().int().min(0).max(200),
        sellIndex: z.number().int().min(0).max(200),
      }),
    )
    .max(30)
    .optional(),
  market: z
    .object({
      buyIndex: z.number().int().min(0).max(200),
      sellIndex: z.number().int().min(0).max(200),
    })
    .optional(),
  dwellMs: z.number().int().min(0).max(10_000).optional(),
  angle: z.number().min(-180).max(180).optional(),
  turnstileToken: z.string().max(2_048).optional(),
  handGestures: z
    .array(
      z.object({
        action: z.enum([
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
        ]),
        durationMs: z.number().int().min(0).max(5_000),
      }),
    )
    .max(6)
    .optional(),
  audioTakes: z
    .array(z.array(z.array(z.number().min(-8).max(8)).max(8)).max(160))
    .max(3)
    .optional(),
  point: z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
      elapsedMs: z.number().int().min(0).max(25_000),
    })
    .optional(),
});

const embedSchema = z.object({
  sitekey: z.string().min(3).max(128).optional(),
  session: z.string().min(8).max(128).optional(),
  action: z.string().min(1).max(64).default("submit"),
  parentOrigin: z.string().url().optional(),
  challengeType: z.enum(CHALLENGE_TYPES).optional(),
  risk: z.enum(RISK_LEVELS).optional(),
  steps: z.coerce.number().int().min(1).max(8).optional(),
  launch: z.enum(["0", "1"]).optional().transform((value) => value === "1"),
  accessible: z.enum(["0", "1"]).optional().transform((value) => value === "1"),
  test: z.enum(["0", "1"]).optional().transform((value) => value === "1"),
}).refine((value) => Boolean(value.sitekey || value.session), {
  message: "sitekey or session is required",
});

const swapSchema = z.object({
  accessible: z.boolean().optional().default(false),
});

const siteverifySchema = z.object({
  secret: z.string().min(1).max(512),
  response: z.string().min(1).max(4096),
  action: z.string().min(1).max(64).optional(),
});

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function apiVersionAllowed(request: FastifyRequest): boolean {
  const requested = request.headers["x-oxygen-challenge-api-version"];
  return requested === undefined || requested === API_VERSION || requested === `v${API_VERSION}`;
}

function deviceClassFor(request: FastifyRequest): "desktop" | "mobile" {
  const mobileHint = String(request.headers["sec-ch-ua-mobile"] ?? "");
  const userAgent = String(request.headers["user-agent"] ?? "");
  if (
    mobileHint === "?1" ||
    /Android|iPhone|iPad|iPod|Mobile|Tablet|HarmonyOS/i.test(userAgent)
  ) {
    return "mobile";
  }
  return "desktop";
}

function highlightedText(value: string, targets: string[]): string {
  if (targets.length === 0) {
    return escapeHtml(value);
  }
  const escapedTargets = targets
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .map((target) => target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escapedTargets.join("|")})`, "g");
  return value
    .split(pattern)
    .map((part) =>
      targets.includes(part) ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part),
    )
    .join("");
}

function gestureLabel(action: HandMotionAction): string {
  const labels: Record<string, string> = {
    open: "张开手掌",
    fist: "握拳",
    peace: "剪刀手",
    thumb_up: "竖起拇指",
    thumb_down: "拇指向下",
    point_up: "食指向上",
    ok: "OK 手势",
    call_me: "六字手势",
    l_sign: "L 形手势",
    pinky: "小指向上",
  };
  return labels[action] ?? "指定手势";
}

function apiBase(config: AppConfig): string {
  return config.publicOrigin;
}

function defaultPublicDir(): string {
  const colocated = resolve(import.meta.dirname, "public");
  if (existsSync(colocated)) {
    return colocated;
  }
  const built = resolve(import.meta.dirname, "..", "dist", "public");
  return existsSync(built) ? built : colocated;
}

function serializeChallenge(state: ChallengeState, config: AppConfig): Record<string, unknown> {
  const base = apiBase(config);
  const common = {
    challengeId: state.id,
    type: state.type,
    siteKey: state.siteKey,
    action: state.action,
    sessionId: state.sessionId,
    step: (state.stepIndex ?? 0) + 1,
    totalSteps: state.totalSteps ?? 1,
    risk: state.risk ?? "low",
    deviceClass: state.deviceClass ?? "desktop",
    preview: state.preview === true,
    swapAllowed: state.swapAllowed === true,
    expiresAt: new Date(state.expiresAt).toISOString(),
    maxAttempts: state.maxAttempts,
  };

  if (state.type === "inverse_occlusion") {
    return {
      ...common,
      backgroundColor: state.backgroundColor,
      inverseColor: state.inverseColor,
      overlayUrl: `${base}/v1/challenges/${state.id}/overlay.svg`,
      audioUrl: `${base}/v1/challenges/${state.id}/audio.wav`,
      prompt: "输入图片中的六位数字",
      decoyText: state.decoyCode,
    };
  }

  if (state.type === "grid_select" && state.grid) {
    return {
      ...common,
      prompt: `选择所有包含“${state.grid.targetName}”的图标`,
      targetName: state.grid.targetName,
      targetUrl: `${base}/v1/challenges/${state.id}/target.svg`,
      tileUrls: state.grid.itemKeys.map(
        (_, index) => `${base}/v1/challenges/${state.id}/tile/${index}.svg`,
      ),
    };
  }

  if (state.type === "audio_sequence" && state.audioSequence) {
    return {
      ...common,
      prompt: "听音频，选择猫叫之后的第一个动物",
      audioUrl: `${base}/v1/challenges/${state.id}/sequence.wav`,
      options: state.audioSequence.options,
    };
  }

  if (state.type === "calculation" && state.calculation) {
    return {
      ...common,
      prompt: "计算结果",
      expression: state.calculation.expression,
    };
  }

  if (state.type === "key_pointer" && state.keyPointer) {
    return {
      ...common,
      prompt: `按住 ${state.keyPointer.requiredKeyLabel} 键，同时向右拖动滑块并保持片刻`,
      requiredDistance: state.keyPointer.requiredDistance,
      requiredHoldMs: state.keyPointer.requiredHoldMs,
      requiredKey: state.keyPointer.requiredKey,
      requiredKeyLabel: state.keyPointer.requiredKeyLabel,
    };
  }

  if (state.type === "pattern_memory" && state.patternMemory) {
    return {
      ...common,
      prompt: "按顺序重复闪烁序列",
      pattern: {
        seed: state.patternMemory.seed,
        sequenceLength: state.patternMemory.sequenceLength,
      },
    };
  }

  if (state.type === "count_flash" && state.countFlash) {
    return {
      ...common,
      prompt: "观察短暂出现的圆点数量",
      countFlash: {
        seed: state.countFlash.seed,
        revealMs: state.countFlash.revealMs,
      },
    };
  }

  if (state.type === "market_trade" && state.marketTrade) {
    return {
      ...common,
      prompt:
        state.marketTrade.mode === "target"
          ? "反复买入和卖出，直到资产达到目标"
          : "在价格低位买入，并在随后价格高位卖出",
      market: {
        seed: state.marketTrade.seed,
        width: state.marketTrade.width,
        height: state.marketTrade.height,
        mode: state.marketTrade.mode,
        sampleMs: state.marketTrade.sampleMs,
        durationMs: state.marketTrade.durationMs,
        initialCapital: state.marketTrade.initialCapital,
        targetCapital: state.marketTrade.targetCapital,
      },
    };
  }

  if (state.type === "human_check" && state.humanCheck) {
    return {
      ...common,
      prompt: "确认你不是自动程序",
      minDwellMs: state.humanCheck.minDwellMs,
    };
  }

  if (state.type === "rotate_align" && state.rotateAlign) {
    return {
      ...common,
      prompt: "旋转图形，使其回到正方向",
      initialAngle: state.rotateAlign.initialAngle,
      tolerance: state.rotateAlign.tolerance,
    };
  }

  if (state.type === "semantic_pick" && state.semanticPick) {
    return {
      ...common,
      prompt: state.semanticPick.question,
      options: state.semanticPick.options,
    };
  }

  if (state.type === "turnstile" && state.turnstile) {
    return {
      ...common,
      prompt: "完成 Cloudflare 人机验证",
      turnstileSiteKey: state.turnstile.siteKey,
    };
  }

  if (state.type === "hand_motion" && state.handMotion) {
    return {
      ...common,
      prompt: "按顺序完成动态手势",
      handMotion: {
        sequence: state.handMotion.sequence,
        holdMs: state.handMotion.holdMs,
      },
    };
  }

  if (state.type === "speech_wave" && state.speechWave) {
    return {
      ...common,
      prompt: "保持环境安静，完整朗读三遍",
      speechWave: {
        phrase: state.speechWave.phrase,
        targetWords: state.speechWave.targetWords,
        focusWindows: state.speechWave.focusWindows,
        focusStart: state.speechWave.focusStart,
        focusEnd: state.speechWave.focusEnd,
        takeCount: state.speechWave.takeCount,
      },
    };
  }

  return {
    ...common,
    prompt: "拖动圆形遮罩覆盖移动目标",
    motion: state.motion,
  };
}

function challengeBody(state: ChallengeState, config: AppConfig): string {
  const id = escapeHtml(state.id);
  const base = escapeHtml(apiBase(config));

  if (state.type === "grid_select" && state.grid) {
    const tiles = state.grid.itemKeys
      .map(
        (_, index) => `
          <button class="oc-tile" type="button" data-index="${index}" aria-label="第 ${index + 1} 个图标" aria-pressed="false">
            <img src="${base}/v1/challenges/${id}/tile/${index}.svg" alt="" draggable="false">
            <span class="oc-tile-check" aria-hidden="true"></span>
          </button>`,
      )
      .join("");
    return `
      <div class="oc-prompt-row">
        <div>
          <p class="oc-kicker">请完成安全验证</p>
          <p class="oc-prompt" id="oc-prompt">选择所有包含“${escapeHtml(state.grid.targetName)}”的图标</p>
        </div>
        <img class="oc-target-icon" src="${base}/v1/challenges/${id}/target.svg" alt="目标图标" draggable="false">
      </div>
      <div class="oc-grid" id="oc-grid" role="group" aria-labelledby="oc-prompt">${tiles}</div>
      <div class="oc-controls oc-controls-end">
        <button class="oc-submit" id="oc-submit" type="submit">验证</button>
      </div>`;
  }

  if (state.type === "motion_drag" && state.motion) {
    return `
      <div class="oc-prompt-row">
        <div>
          <p class="oc-kicker">安全验证</p>
          <p class="oc-prompt" id="oc-prompt">拖动下方的圆形遮罩，覆盖画面中的蓝色移动目标</p>
        </div>
        <span class="oc-motion-badge">实时</span>
      </div>
      <div class="oc-motion-wrap" data-width="${state.motion.width}" data-height="${state.motion.height}" data-seed="${state.motion.seed}" data-duration="${state.motion.durationMs}" data-required-coverage="${state.motion.requiredCoverageMs}" data-target-radius="${state.motion.targetRadius}">
        <canvas id="oc-motion-canvas" width="${state.motion.width}" height="${state.motion.height}" aria-label="移动目标覆盖区域"></canvas>
      </div>
      <p class="oc-helper" id="oc-motion-help">持续覆盖目标，直到验证按钮可用。</p>
      <div class="oc-controls oc-controls-end">
        <button class="oc-submit" id="oc-submit" type="submit" disabled>验证</button>
      </div>`;
  }

  if (state.type === "audio_sequence" && state.audioSequence) {
    const options = state.audioSequence.options
      .map(
        (option) => `
          <button class="oc-choice" type="button" data-choice="${escapeHtml(option.key)}" aria-pressed="false">
            <span class="oc-choice-icon" aria-hidden="true"></span>
            <span class="oc-choice-label">${escapeHtml(option.label)}</span>
            <span class="oc-choice-check" aria-hidden="true"></span>
          </button>`,
      )
      .join("");
    return `
      <div class="oc-prompt-row">
        <div>
          <p class="oc-kicker">安全验证</p>
          <p class="oc-prompt" id="oc-prompt">听音频，选择猫叫之后的第一个动物</p>
        </div>
        <span class="oc-difficulty">音频</span>
      </div>
      <button class="oc-media-button" id="oc-play-sequence" type="button">
        <span class="oc-media-icon" aria-hidden="true"></span>
        <span>播放声音</span>
      </button>
      <div class="oc-choice-grid" id="oc-choices" role="group" aria-labelledby="oc-prompt">${options}</div>
      <div class="oc-controls oc-controls-end">
        <button class="oc-submit" id="oc-submit" type="submit" disabled>验证</button>
      </div>`;
  }

  if (state.type === "calculation" && state.calculation) {
    return `
      <div class="oc-prompt-row">
        <div>
          <p class="oc-kicker">安全验证</p>
          <p class="oc-prompt" id="oc-prompt">计算下列算式</p>
        </div>
        <span class="oc-difficulty">计算</span>
      </div>
      <div class="oc-expression" id="oc-expression">${escapeHtml(state.calculation.expression)}</div>
      <div class="oc-controls">
        <label class="oc-field" for="oc-answer">
          <span class="oc-label">计算结果</span>
          <input id="oc-answer" name="answer" type="text" inputmode="numeric" autocomplete="off"
                 maxlength="16" pattern="[0-9 ]*" placeholder="输入整数结果" required>
        </label>
        <button class="oc-submit" id="oc-submit" type="submit">验证</button>
      </div>`;
  }

  if (state.type === "key_pointer" && state.keyPointer) {
    return `
      <div class="oc-prompt-row">
        <div>
          <p class="oc-kicker">安全验证</p>
          <p class="oc-prompt" id="oc-prompt">按住 ${escapeHtml(state.keyPointer.requiredKeyLabel)} 键，同时向右拖动</p>
        </div>
        <span class="oc-difficulty">组合操作</span>
      </div>
      <div class="oc-gesture-wrap" data-required-distance="${state.keyPointer.requiredDistance}" data-required-hold="${state.keyPointer.requiredHoldMs}" data-required-key="${escapeHtml(state.keyPointer.requiredKey)}" data-required-key-label="${escapeHtml(state.keyPointer.requiredKeyLabel)}">
        <div class="oc-keycap" aria-hidden="true">${escapeHtml(state.keyPointer.requiredKeyLabel)}</div>
        <div class="oc-gesture-track" id="oc-gesture-track" role="slider" tabindex="0"
             aria-label="按住 ${escapeHtml(state.keyPointer.requiredKeyLabel)} 键并拖到右侧" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <span class="oc-gesture-fill"></span>
          <span class="oc-gesture-knob"></span>
        </div>
      </div>
      <p class="oc-helper" id="oc-gesture-help">需要同时按住键盘并拖动滑块。</p>
      <div class="oc-controls oc-controls-end">
        <button class="oc-submit" id="oc-submit" type="submit" disabled>验证</button>
      </div>`;
  }

  if (state.type === "pattern_memory" && state.patternMemory) {
    const patternButtons = Array.from({ length: 4 }, (_, index) => `
      <button class="oc-pattern-button" type="button" data-index="${index}" aria-label="序列图标 ${index + 1}" disabled>
        <span class="oc-pattern-icon" aria-hidden="true"></span>
      </button>`).join("");
    return `
      <div class="oc-prompt-row">
        <div>
          <p class="oc-kicker">安全验证</p>
          <p class="oc-prompt" id="oc-prompt">看一遍闪烁顺序，再按相同顺序点击</p>
        </div>
        <span class="oc-difficulty">${state.patternMemory.sequenceLength} 步</span>
      </div>
      <div class="oc-pattern-grid" id="oc-pattern-grid"
           data-seed="${state.patternMemory.seed}"
           data-length="${state.patternMemory.sequenceLength}"
           role="group" aria-labelledby="oc-prompt">${patternButtons}</div>
      <button class="oc-media-button" id="oc-pattern-play" type="button">
        <span class="oc-media-icon" aria-hidden="true"></span>
        <span>播放序列</span>
      </button>
      <div class="oc-controls oc-controls-end">
        <button class="oc-submit" id="oc-submit" type="submit" disabled>验证</button>
      </div>`;
  }

  if (state.type === "count_flash" && state.countFlash) {
    return `
      <div class="oc-prompt-row">
        <div>
          <p class="oc-kicker">安全验证</p>
          <p class="oc-prompt" id="oc-prompt">记住画面短暂出现的圆点数量</p>
        </div>
        <span class="oc-difficulty">观察</span>
      </div>
      <div class="oc-count-wrap">
        <canvas id="oc-count-canvas" width="360" height="170"
                data-seed="${state.countFlash.seed}"
                data-reveal="${state.countFlash.revealMs}"
                aria-label="短暂显示圆点的区域"></canvas>
      </div>
      <button class="oc-media-button" id="oc-count-start" type="button">
        <span class="oc-media-icon" aria-hidden="true"></span>
        <span>开始观察</span>
      </button>
      <div class="oc-controls">
        <label class="oc-field" for="oc-answer">
          <span class="oc-label">圆点数量</span>
          <input id="oc-answer" name="answer" type="text" inputmode="numeric" autocomplete="off"
                 maxlength="2" pattern="[0-9]*" placeholder="输入看到的数量" disabled required>
        </label>
        <button class="oc-submit" id="oc-submit" type="submit" disabled>验证</button>
      </div>`;
  }

  if (state.type === "market_trade" && state.marketTrade) {
    const targetMode = state.marketTrade.mode === "target";
    return `
      <div class="oc-prompt-row">
        <div>
          <p class="oc-kicker">安全验证</p>
          <p class="oc-prompt" id="oc-prompt">${targetMode ? "反复交易，直到资产达到目标" : "选择一次买入和卖出时机"}</p>
        </div>
        <span class="oc-difficulty">${targetMode ? "目标模式" : "单次交易"}</span>
      </div>
      <div class="oc-market-wrap">
        <canvas id="oc-market-canvas" width="${state.marketTrade.width}" height="${state.marketTrade.height}"
                data-seed="${state.marketTrade.seed}"
                data-version="2"
                data-mode="${state.marketTrade.mode}"
                data-sample-ms="${state.marketTrade.sampleMs}"
                data-duration="${state.marketTrade.durationMs}"
                data-initial-capital="${state.marketTrade.initialCapital ?? 1000}"
                data-target-capital="${state.marketTrade.targetCapital ?? 0}"
                aria-label="股票价格走势图"></canvas>
      </div>
      <div class="oc-market-summary" id="oc-market-summary">${targetMode ? `<span>本金 <strong id="oc-market-capital">${state.marketTrade.initialCapital ?? 1000}</strong></span><span>目标 <strong>${state.marketTrade.targetCapital ?? 0}</strong></span>` : "<span>等待价格走势</span>"}</div>
      <div class="oc-trade-actions" role="group" aria-label="交易方向">
        <button class="oc-trade-button is-active" id="oc-market-buy" type="button" aria-pressed="true">买入</button>
        <button class="oc-trade-button" id="oc-market-sell" type="button" aria-pressed="false">卖出</button>
      </div>
      <p class="oc-helper" id="oc-market-help">在图表上选择交易时机。</p>
      <div class="oc-controls oc-controls-end">
        <button class="oc-submit" id="oc-submit" type="submit" disabled>验证</button>
      </div>`;
  }

  if (state.type === "human_check" && state.humanCheck) {
    return `
      <div class="oc-prompt-row">
        <div>
          <p class="oc-kicker">安全验证</p>
          <p class="oc-prompt" id="oc-prompt">确认你不是自动程序</p>
        </div>
        <span class="oc-difficulty">基础</span>
      </div>
      <label class="oc-human-check" id="oc-human-check" data-min-dwell="${state.humanCheck.minDwellMs}">
        <input id="oc-human-input" type="checkbox">
        <span class="oc-human-box" aria-hidden="true"></span>
        <span class="oc-human-copy">
          <strong>我不是机器人</strong>
          <small>点击后完成本地交互检查</small>
        </span>
      </label>
      <div class="oc-controls oc-controls-end">
        <button class="oc-submit" id="oc-submit" type="submit" disabled>验证</button>
      </div>`;
  }

  if (state.type === "rotate_align" && state.rotateAlign) {
    return `
      <div class="oc-prompt-row">
        <div>
          <p class="oc-kicker">安全验证</p>
          <p class="oc-prompt" id="oc-prompt">旋转图形，使其回到正方向</p>
        </div>
        <span class="oc-difficulty">基础</span>
      </div>
      <div class="oc-rotate-stage">
        <div class="oc-rotate-object" id="oc-rotate-object" style="transform:rotate(${state.rotateAlign.initialAngle}deg)">
          <span></span>
        </div>
      </div>
      <label class="oc-slider-row" for="oc-rotate-slider">
        <span>旋转角度</span>
        <input id="oc-rotate-slider" type="range" min="-180" max="180" step="1" value="${state.rotateAlign.initialAngle}">
        <output id="oc-rotate-value">${state.rotateAlign.initialAngle}°</output>
      </label>
      <div class="oc-controls oc-controls-end">
        <button class="oc-submit" id="oc-submit" type="submit">验证</button>
      </div>`;
  }

  if (state.type === "semantic_pick" && state.semanticPick) {
    const options = state.semanticPick.options
      .map(
        (option) => `
          <button class="oc-choice oc-semantic-choice" type="button" data-choice="${escapeHtml(option.key)}" aria-pressed="false">
            <span class="oc-choice-label">${escapeHtml(option.label)}</span>
            <span class="oc-choice-check" aria-hidden="true"></span>
          </button>`,
      )
      .join("");
    return `
      <div class="oc-prompt-row">
        <div>
          <p class="oc-kicker">安全验证</p>
          <p class="oc-prompt" id="oc-prompt">${escapeHtml(state.semanticPick.question)}</p>
        </div>
        <span class="oc-difficulty">基础</span>
      </div>
      <div class="oc-choice-grid oc-choice-grid-four" id="oc-choices" role="group" aria-labelledby="oc-prompt">${options}</div>
      <div class="oc-controls oc-controls-end">
        <button class="oc-submit" id="oc-submit" type="submit" disabled>验证</button>
      </div>`;
  }

  if (state.type === "turnstile" && state.turnstile) {
    return `
      <div class="oc-prompt-row">
        <div>
          <p class="oc-kicker">安全验证</p>
          <p class="oc-prompt" id="oc-prompt">完成人机验证后继续</p>
        </div>
        <span class="oc-difficulty">托管验证</span>
      </div>
      <div class="oc-turnstile-shell">
        <div id="oc-turnstile" data-sitekey="${escapeHtml(state.turnstile.siteKey)}" data-language="zh-CN"></div>
      </div>
      <div class="oc-controls oc-controls-end">
        <button class="oc-submit" id="oc-submit" type="submit" disabled>继续</button>
      </div>`;
  }

  if (state.type === "hand_motion" && state.handMotion) {
    const sequence = state.handMotion.sequence
      .map(
        (action, index) =>
          `<span class="oc-action-chip" data-action="${escapeHtml(action)}">${index + 1}. ${gestureLabel(action)}</span>`,
      )
      .join("");
    return `
      <div class="oc-prompt-row">
        <div>
          <p class="oc-kicker">安全验证</p>
          <p class="oc-prompt" id="oc-prompt">按顺序完成动作，每个动作保持片刻</p>
        </div>
        <span class="oc-difficulty">动态动作</span>
      </div>
      <div class="oc-camera-wrap">
        <video id="oc-hand-video" playsinline muted></video>
        <canvas id="oc-hand-overlay" width="360" height="240"></canvas>
        <div class="oc-camera-placeholder" id="oc-camera-placeholder">摄像头未启用</div>
      </div>
      <div class="oc-action-sequence" id="oc-action-sequence" data-sequence="${escapeHtml(state.handMotion.sequence.join(","))}" data-hold="${state.handMotion.holdMs}">${sequence}</div>
      <button class="oc-media-button" id="oc-hand-start" type="button">
        <span class="oc-media-icon" aria-hidden="true"></span>
        <span>启用摄像头并开始</span>
      </button>
      <p class="oc-helper" id="oc-hand-help">请让手部完整出现在画面中。</p>
      <div class="oc-controls oc-controls-end">
        <button class="oc-submit" id="oc-submit" type="submit" disabled>验证</button>
      </div>`;
  }

  if (state.type === "speech_wave" && state.speechWave) {
    const takes = Array.from(
      { length: state.speechWave.takeCount },
      (_, index) =>
        `<div class="oc-speech-take" data-take="${index}"><span>第 ${index + 1} 遍</span><strong>未录制</strong></div>`,
    ).join("");
    return `
      <div class="oc-prompt-row">
        <div>
          <p class="oc-kicker">安全验证</p>
          <p class="oc-prompt" id="oc-prompt">保持自然语速，完整朗读三遍</p>
        </div>
        <span class="oc-difficulty">${state.speechWave.takeCount} 遍</span>
      </div>
      <div class="oc-speech-phrase" id="oc-speech-phrase"
           data-take-count="${state.speechWave.takeCount}"
           data-focus-start="${state.speechWave.focusStart}"
           data-focus-end="${state.speechWave.focusEnd}">${highlightedText(state.speechWave.phrase, state.speechWave.targetWords)}</div>
      <div class="oc-speech-takes" id="oc-speech-takes">${takes}</div>
      <canvas class="oc-speech-wave" id="oc-speech-wave" width="360" height="72" aria-label="麦克风波形"></canvas>
      <button class="oc-media-button" id="oc-speech-record" type="button">
        <span class="oc-media-icon" aria-hidden="true"></span>
        <span>录制第 1 遍</span>
      </button>
      <p class="oc-helper" id="oc-speech-help">请在安静环境中按原句朗读。</p>
      <div class="oc-controls oc-controls-end">
        <button class="oc-submit" id="oc-submit" type="submit" disabled>验证</button>
      </div>`;
  }

  const backgroundColor = escapeHtml(state.backgroundColor ?? "#172033");
  const inverseColor = escapeHtml(state.inverseColor ?? "#f4e0cc");
  return `
    <div class="oc-prompt-row">
      <div>
        <p class="oc-kicker">安全验证</p>
        <p class="oc-prompt" id="oc-prompt">输入图片中的六位数字</p>
      </div>
      <span class="oc-difficulty">6 位</span>
    </div>
    <div class="oc-image-wrap" style="--oc-bg:${backgroundColor};--oc-fg:${inverseColor}">
      <span class="oc-decoy" aria-hidden="true">${escapeHtml(state.decoyCode ?? "")}</span>
      <img class="oc-image" src="${base}/v1/challenges/${id}/overlay.svg" alt="六位数字验证码" draggable="false" decoding="sync">
    </div>
    <div class="oc-controls">
      <label class="oc-field" for="oc-answer">
        <span class="oc-label">验证码</span>
        <input id="oc-answer" name="answer" type="text" inputmode="numeric" autocomplete="one-time-code"
               maxlength="12" pattern="[0-9 ]*" placeholder="输入图片中的数字" required>
      </label>
      <button class="oc-submit" id="oc-submit" type="submit">验证</button>
    </div>`;
}

function embedHtml(state: ChallengeState, config: AppConfig, testMode = false): string {
  const parentOrigin = state.parentOrigin ?? "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>OxygenChallenge</title>
  <link rel="stylesheet" href="${escapeHtml(apiBase(config))}/widget.css">
  ${state.type === "turnstile" ? '<script defer src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"></script>' : ""}
  <script defer src="${escapeHtml(apiBase(config))}/frame.js"></script>
</head>
<body class="oc-frame" data-challenge-type="${escapeHtml(state.type)}" data-test-mode="${testMode ? "1" : "0"}" data-risk="${escapeHtml(state.risk ?? "low")}">
  <main class="oc-shell" data-challenge-id="${escapeHtml(state.id)}" data-site-key="${escapeHtml(state.siteKey)}" data-action="${escapeHtml(state.action)}" data-session-id="${escapeHtml(state.sessionId ?? "")}" data-parent-origin="${escapeHtml(parentOrigin)}" data-preview="${state.preview ? "1" : "0"}" data-swap-allowed="${state.swapAllowed ? "1" : "0"}">
    <form class="oc-card" id="oc-form" novalidate>
      <header class="oc-header">
        <div class="oc-brand">
          <span class="oc-brand-mark" aria-hidden="true"></span>
          <span>OxygenChallenge</span>
        </div>
        <div class="oc-tools">
          ${state.type === "inverse_occlusion" ? `
          <button class="oc-icon-button" id="oc-audio" type="button" aria-label="播放听觉验证码" title="播放听觉验证码"></button>` : ""}
          ${
            state.preview || state.swapAllowed
              ? `
          <button class="oc-icon-button" id="oc-refresh" type="button" aria-label="换一道挑战" title="换一道挑战"></button>
          `
              : ""
          }
        </div>
      </header>
      <div class="oc-challenge">
        ${challengeBody(state, config)}
      </div>
      <footer class="oc-footer">
        <div class="oc-legal">
          <span class="oc-brand-note">安全验证由 OxygenChallenge 提供</span>
          <p>与此 Captcha 交互即代表您同意我们的<a href="${escapeHtml(apiBase(config))}/privacy-policy" target="_blank" rel="noopener noreferrer">隐私政策</a>和<a href="${escapeHtml(apiBase(config))}/user-agreement" target="_blank" rel="noopener noreferrer">用户条款</a></p>
        </div>
        <div class="oc-footer-actions">
          <button class="oc-text-button" id="oc-accessible" type="button" aria-label="切换到无障碍验证">无障碍验证</button>
          <span class="oc-progress">${(state.stepIndex ?? 0) + 1} / ${state.totalSteps ?? 1}</span>
        </div>
      </footer>
      <span class="oc-status" id="oc-status" role="status" aria-live="polite"></span>
      <audio id="oc-player" preload="none"></audio>
    </form>
  </main>
</body>
</html>`;
}

function errorPage(status: number, message: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OxygenChallenge</title></head><body style="margin:0;background:#111827;color:#eee7d8;font:16px system-ui;padding:24px"><p>HTTP ${status}</p><h1>${escapeHtml(message)}</h1></body></html>`;
}

function entryHtml(
  state: {
    siteKey: string;
    action: string;
    parentOrigin: string | null;
    sessionId: string | undefined;
    accessible: boolean;
    testMode: boolean;
  },
  config: AppConfig,
): string {
  const base = escapeHtml(apiBase(config));
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>OxygenChallenge</title>
  <link rel="stylesheet" href="${base}/widget.css">
  <script defer src="${base}/frame.js"></script>
</head>
<body class="oc-frame oc-entry-page" data-entry="1" data-challenge-type="entry" data-test-mode="${state.testMode ? "1" : "0"}">
  <main class="oc-shell oc-entry-shell" data-site-key="${escapeHtml(state.siteKey)}" data-action="${escapeHtml(state.action)}" data-session-id="${escapeHtml(state.sessionId ?? "")}" data-parent-origin="${escapeHtml(state.parentOrigin ?? "")}" data-accessible="${state.accessible ? "1" : "0"}">
    <section class="oc-entry" aria-label="OxygenChallenge">
      <div class="oc-entry-bar">
        <button class="oc-entry-check" id="oc-entry-check" type="button" aria-label="我是人类">
          <span class="oc-entry-check-box" aria-hidden="true"></span>
          <span class="oc-entry-spinner" aria-hidden="true"></span>
        </button>
        <span class="oc-entry-label" id="oc-entry-label">我是人类</span>
        <img class="oc-entry-mark" src="${base}/oxygenmark.png" alt="Oxygen">
      </div>
      <div class="oc-entry-brand">
        <span>Oxygen Challenge</span>
        <button class="oc-entry-accessibility" id="oc-entry-accessibility" type="button">无障碍验证</button>
      </div>
    </section>
  </main>
</body>
</html>`;
}

export type BuildAppOptions = {
  config?: AppConfig;
  publicDir?: string;
  logger?: boolean;
  turnstileVerifier?: (
    secret: string,
    token: string,
    remoteIp?: string,
  ) => Promise<{ success: boolean; errorCodes: string[] }>;
};

export async function buildApp(options: BuildAppOptions = {}): Promise<{
  app: FastifyInstance;
  config: AppConfig;
  challenges: ChallengeStore;
  tokens: TokenService;
  platformStore: PlatformStore;
}> {
  const config = options.config ?? loadConfig();
  const tokens = new TokenService(config.publicOrigin, config.tokenTtlSeconds, config.tokenSeed);
  if (
    config.nodeEnv === "production" &&
    config.oxygenAccountClientId &&
    !config.platformDataKey
  ) {
    throw new Error("OXY_PLATFORM_DATA_KEY_BASE64 is required for the open platform");
  }
  const platformKey =
    config.platformDataKey ??
    createHash("sha256")
      .update(config.tokenSeed ?? Buffer.from(config.publicOrigin))
      .digest();
  const platformStore = new PlatformStore(config.platformDataFile, platformKey, config.sites);
  await platformStore.load();
  const challenges = new ChallengeStore(config, tokens);
  const riskTracker = new RiskTracker();
  const verifyTurnstileToken =
    options.turnstileVerifier ??
    ((secret: string, token: string, remoteIp?: string) =>
      verifyTurnstile(secret, token, remoteIp));
  const app = Fastify({
    logger: options.logger === false ? false : { level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: 64 * 1024,
    trustProxy: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'none'"],
        "script-src": ["'self'", "https://challenges.cloudflare.com"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "blob:"],
        "media-src": ["'self'", "blob:"],
        "connect-src": ["'self'", "https://challenges.cloudflare.com"],
        "frame-src": ["'self'", "https://challenges.cloudflare.com"],
        "worker-src": ["'self'", "blob:"],
        "frame-ancestors": ["*"],
        "base-uri": ["'none'"],
        "form-action": ["'self'"],
      },
    },
  });
  await app.register(cors, {
    credentials: false,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, config.sites.some((site) => siteAllowsOrigin(site, origin)));
    },
  });
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: "1 minute",
  });

  const publicDir = options.publicDir ?? defaultPublicDir();
  if (existsSync(publicDir)) {
    await app.register(fastifyStatic, {
      root: publicDir,
      prefix: "/",
      index: false,
      wildcard: true,
      decorateReply: false,
    });
  }

  app.addHook("onSend", async (request, reply, payload) => {
    if (request.url.startsWith("/v1/")) {
      reply.header("X-Oxygen-Challenge-API-Version", API_VERSION);
    }
    if (["/widget.js", "/widget.css", "/frame.js"].includes(request.url)) {
      reply.header("Cross-Origin-Resource-Policy", "cross-origin");
      reply.header("Access-Control-Allow-Origin", "*");
      reply.header("Access-Control-Allow-Private-Network", "true");
    }
    if (request.url.startsWith("/v1/challenges") || request.url.startsWith("/embed")) {
      reply.header("Cache-Control", "no-store, max-age=0");
      reply.header("Pragma", "no-cache");
    }
    return payload;
  });

  app.get("/", async (_request, reply) => {
    reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "public, max-age=60")
      .header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
    return reply.send(officialSiteHtml(config));
  });

  for (const [path, kind] of [
    ["/privacy-policy", "privacy"],
    ["/user-agreement", "terms"],
  ] as const) {
    app.get(path, async (_request, reply) => {
      reply
        .type("text/html; charset=utf-8")
        .header("Cache-Control", "public, max-age=300")
        .header(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'none'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        );
      return reply.send(legalPageHtml(config, kind));
    });
  }

  app.get("/v1/meta", async () => ({
      name: "OxygenChallenge",
      version: "v26.0-alpha.5",
      apiVersion: API_VERSION,
      mode: "api-and-open-platform",
      challengeTypes: CHALLENGE_TYPES,
      riskLevels: RISK_STEPS,
      endpoints: {
        challenge: "/v1/challenges",
        challengeAssets: "/v1/challenges/:id/*",
        siteverify: "/v1/siteverify",
        embed: "/embed",
        jwks: "/.well-known/oxygenchallenge/jwks.json",
        health: "/healthz",
      },
  }));

  app.get("/captcha", async (request, reply) => {
    const site = config.sites[0];
    if (!site) {
      return reply.code(503).type("text/html").send(errorPage(503, "验证服务尚未配置"));
    }
    const query = request.query as { launch?: string; accessible?: string };
    const accessible = query.accessible === "1";
    if (query.launch !== "1") {
      reply
        .type("text/html; charset=utf-8")
        .header("Cache-Control", "no-store")
        .header("X-Robots-Tag", "noindex, nofollow")
        .header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'")
        .header("Permissions-Policy", "camera=(self), microphone=(self)");
      return reply.send(
        entryHtml(
          {
            siteKey: site.key,
            action: "submit",
            parentOrigin: config.publicOrigin,
            sessionId: undefined,
            accessible,
            testMode: false,
          },
          config,
        ),
      );
    }
    const state = challenges.createPreview(
      site.key,
      "submit",
      config.publicOrigin,
      deviceClassFor(request),
      accessible,
    );
    reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("X-Robots-Tag", "noindex, nofollow")
      .header("Content-Security-Policy", "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; worker-src 'self' blob:; frame-ancestors 'self'; base-uri 'none'; form-action 'self'")
      .header("Permissions-Policy", "camera=(self), microphone=(self)");
    return reply.send(
      embedHtml(state, config, config.nodeEnv !== "production"),
    );
  });

  app.get("/healthz", async () => ({
    status: "ok",
    service: "oxygenchallenge",
    activeChallenges: challenges.size(),
  }));

  if (config.nodeEnv !== "production") {
    app.get("/__test/challenge/:id", async (request, reply) => {
      const { id } = request.params as { id: string };
      const state = challenges.getForAsset(id);
      if (!state) {
        return reply.code(404).send({ error: "CHALLENGE_NOT_FOUND" });
      }
      return state;
    });

    app.get("/__test-host", async (_request, reply) => {
      reply
        .type("text/html; charset=utf-8")
        .header("Cache-Control", "no-store")
        .header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'");
      return reply.send(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OxygenChallenge host smoke</title>
<style>body{margin:0;background:#f5f5f7;font:16px system-ui;padding:32px}form{max-width:420px;margin:auto}label{display:block;margin:16px 0 6px}input{box-sizing:border-box;width:100%;min-height:44px;padding:0 12px}button{min-height:44px;margin-top:12px}</style></head>
<body><form id="host-form"><label for="email">测试表单</label><input id="email" name="email" type="email" autocomplete="email"><oxygen-challenge sitekey="oc_dev_public" action="submit"></oxygen-challenge><button type="submit">提交表单</button></form><script src="/widget.js" defer></script></body></html>`);
    });
  }

  app.get("/.well-known/oxygenchallenge/jwks.json", async () => tokens.jwks());

  app.post("/v1/challenges", async (request, reply) => {
    if (!apiVersionAllowed(request)) {
      return reply.code(400).send({ error: "API_VERSION_MISMATCH" });
    }
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_REQUEST", issues: parsed.error.issues });
    }

    const site = getSite(config, parsed.data.siteKey);
    if (!site) {
      return reply.code(404).send({ error: "SITE_NOT_FOUND" });
    }
    if (!siteAllowsAction(site, parsed.data.action)) {
      return reply.code(403).send({ error: "ACTION_NOT_ALLOWED" });
    }

    const origin = requestOrigin(request.headers.origin, request.headers.referer);
    if (!siteAllowsOrigin(site, origin)) {
      return reply.code(403).send({ error: "ORIGIN_NOT_ALLOWED" });
    }
    if (
      parsed.data.challengeType === "turnstile" &&
      (!config.turnstileSiteKey || !config.turnstileSecretKey)
    ) {
      return reply.code(400).send({ error: "TURNSTILE_NOT_CONFIGURED" });
    }

    const risk = riskTracker.assess(
      { headers: request.headers, ip: request.ip },
      config.nodeEnv === "production",
      parsed.data.risk,
    );
    request.log.info(
      {
        event: "risk.assessed",
        score: risk.score,
        level: risk.level,
        reasons: risk.reasons,
        ip: risk.ip,
        country: risk.country,
        platform: risk.platform,
        system: risk.system,
        siteKey: parsed.data.siteKey,
      },
      "risk assessed",
    );

    const state = challenges.create(
      parsed.data.siteKey,
      parsed.data.action,
      origin,
      parsed.data.accessible,
      parsed.data.challengeType,
      risk.level,
      parsed.data.steps,
      false,
      deviceClassFor(request),
    );

    reply.header("X-Oxygen-Challenge-Id", state.id);
    return serializeChallenge(state, config);
  });

  app.post("/v1/challenges/:id/verify", async (request, reply) => {
    const parsed = verifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ verified: false, code: "INVALID_REQUEST" });
    }

    const state = findState(challenges, request);
    if (!state) {
      return reply.code(404).send({ verified: false, code: "CHALLENGE_NOT_FOUND" });
    }

    let turnstilePassed = false;
    if (
      state.type === "turnstile" &&
      parsed.data.turnstileToken &&
      config.turnstileSecretKey
    ) {
      const turnstile = await verifyTurnstileToken(
        config.turnstileSecretKey,
        parsed.data.turnstileToken,
        clientIp({ headers: request.headers, ip: request.ip }),
      );
      turnstilePassed = turnstile.success;
      if (!turnstile.success) {
        request.log.warn(
          {
            event: "turnstile.failed",
            challengeId: state.id,
            errorCodes: turnstile.errorCodes,
          },
          "turnstile verification failed",
        );
      }
    }

    const result = challenges.verify(state.id, {
      ...(parsed.data.answer ? { answer: parsed.data.answer } : {}),
      ...(parsed.data.selectedIndices ? { selectedIndices: parsed.data.selectedIndices } : {}),
      ...(parsed.data.holdMs !== undefined ? { holdMs: parsed.data.holdMs } : {}),
      ...(parsed.data.distance !== undefined ? { distance: parsed.data.distance } : {}),
      ...(parsed.data.keyCode ? { keyCode: parsed.data.keyCode } : {}),
      ...(parsed.data.coverageMs !== undefined
        ? { coverageMs: parsed.data.coverageMs }
        : {}),
      ...(parsed.data.marketTrades
        ? { marketTrades: parsed.data.marketTrades }
        : parsed.data.market
          ? { marketTrades: [parsed.data.market] }
          : {}),
      ...(parsed.data.dwellMs !== undefined ? { dwellMs: parsed.data.dwellMs } : {}),
      ...(parsed.data.angle !== undefined ? { angle: parsed.data.angle } : {}),
      ...(parsed.data.handGestures ? { handGestures: parsed.data.handGestures } : {}),
      ...(parsed.data.audioTakes ? { audioTakes: parsed.data.audioTakes } : {}),
      ...(state.type === "turnstile" ? { turnstilePassed } : {}),
      ...(parsed.data.point ? { point: parsed.data.point } : {}),
    });
    logVerification(request, state, result);
    if (result.kind === "verified") {
      return reply.send(result.receipt);
    }
    if (result.kind === "preview") {
      return reply.send(result.receipt);
    }
    if (result.kind === "step") {
      const nextChallenge = serializeChallenge(result.nextState, config);
      return reply.send({
        verified: false,
        stepPassed: true,
        code: "STEP_PASSED",
        sessionId: result.session.id,
        step: result.session.currentStep,
        totalSteps: result.session.totalSteps,
        remainingSteps: result.session.totalSteps - result.session.currentStep,
        nextChallenge,
        nextEmbedUrl: `${apiBase(config)}/embed?session=${encodeURIComponent(result.session.id)}&launch=1${
          result.session.testMode && config.nodeEnv !== "production" ? "&test=1" : ""
        }`,
      });
    }

    const code = result.failure.code === "HONEYPOT_TRIGGERED" ? "INVALID_ANSWER" : result.failure.code;
    const status =
      code === "CHALLENGE_NOT_FOUND"
        ? 404
        : code === "CHALLENGE_EXPIRED" || code === "CHALLENGE_USED"
          ? 410
          : 200;
    return reply.code(status).send({ verified: false, code, ...("remainingAttempts" in result.failure ? { remainingAttempts: result.failure.remainingAttempts } : {}) });
  });

  app.post("/v1/challenges/:id/swap", async (request, reply) => {
    const parsed = swapSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ swapped: false, code: "INVALID_REQUEST" });
    }
    const state = findState(challenges, request);
    if (!state) {
      return reply.code(404).send({ swapped: false, code: "CHALLENGE_NOT_FOUND" });
    }
    const result = challenges.swap(state.id, parsed.data.accessible);
    if (result.kind === "failed") {
      return reply.code(403).send({
        swapped: false,
        code: result.failure.code,
      });
    }
    const swappedSession = result.sessionId
      ? challenges.getSession(result.sessionId)
      : undefined;
    return {
      swapped: true,
      challengeId: result.state.id,
      preview: result.state.preview === true,
      type: result.state.type,
      ...(result.state.preview
        ? {}
        : {
            sessionId: result.sessionId,
            nextEmbedUrl: `${apiBase(config)}/embed?session=${encodeURIComponent(
              result.sessionId ?? "",
            )}&launch=1${
              swappedSession?.testMode && config.nodeEnv !== "production"
                ? "&test=1"
                : ""
            }${
              parsed.data.accessible ? "&accessible=1" : ""
            }`,
          }),
    };
  });

  app.get("/v1/challenges/:id/overlay.svg", async (request, reply) => {
    const { id } = request.params as { id: string };
    const state = challenges.getForAsset(id);
    if (!state || state.type !== "inverse_occlusion") {
      return reply.code(410).send({ error: "CHALLENGE_EXPIRED" });
    }
    reply
      .header("Content-Type", "image/svg+xml; charset=utf-8")
      .header("Content-Disposition", "inline")
      .header("Cache-Control", "no-store")
      .header("X-Robots-Tag", "noindex, nofollow");
    return reply.send(renderChallengeSvg(state));
  });

  app.get("/v1/challenges/:id/audio.wav", async (request, reply) => {
    const { id } = request.params as { id: string };
    const state = challenges.getForAsset(id);
    if (!state || state.type !== "inverse_occlusion" || !state.visibleCode) {
      return reply.code(410).send({ error: "CHALLENGE_EXPIRED" });
    }
    const wave = renderDtmfWave(state.visibleCode);
    reply
      .header("Content-Type", "audio/wav")
      .header("Content-Disposition", "inline; filename=oxygenchallenge.wav")
      .header("Cache-Control", "no-store")
      .header("X-Robots-Tag", "noindex, nofollow");
    return reply.send(wave);
  });

  app.get("/v1/challenges/:id/sequence.wav", async (request, reply) => {
    const { id } = request.params as { id: string };
    const state = challenges.getForAsset(id);
    if (!state || state.type !== "audio_sequence" || !state.audioSequence) {
      return reply.code(410).send({ error: "CHALLENGE_EXPIRED" });
    }
    const wave = renderAnimalSequenceWave(state.audioSequence.animals);
    reply
      .header("Content-Type", "audio/wav")
      .header("Content-Disposition", "inline; filename=oxygenchallenge-sequence.wav")
      .header("Cache-Control", "no-store")
      .header("X-Robots-Tag", "noindex, nofollow");
    return reply.send(wave);
  });

  app.get("/v1/challenges/:id/target.svg", async (request, reply) => {
    const { id } = request.params as { id: string };
    const state = challenges.getForAsset(id);
    if (!state || state.type !== "grid_select" || !state.grid) {
      return reply.code(410).send({ error: "CHALLENGE_EXPIRED" });
    }
    reply
      .header("Content-Type", "image/svg+xml; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("X-Robots-Tag", "noindex, nofollow");
    return reply.send(renderTargetSvg(state.grid.targetKey));
  });

  app.get("/v1/challenges/:id/tile/:index.svg", async (request, reply) => {
    const { id, index } = request.params as { id: string; index: string };
    const state = challenges.getForAsset(id);
    const tileIndex = Number.parseInt(index, 10);
    if (
      !state ||
      state.type !== "grid_select" ||
      !state.grid ||
      !Number.isInteger(tileIndex) ||
      tileIndex < 0 ||
      tileIndex >= state.grid.itemKeys.length
    ) {
      return reply.code(410).send({ error: "CHALLENGE_EXPIRED" });
    }
    reply
      .header("Content-Type", "image/svg+xml; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("X-Robots-Tag", "noindex, nofollow");
    return reply.send(renderGridItemSvg(state.grid.itemKeys[tileIndex] ?? "cat", tileIndex));
  });

  app.get("/embed", async (request, reply) => {
    const parsed = embedSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).type("text/html").send(errorPage(400, "嵌入参数不完整"));
    }

    let testMode = parsed.data.test && config.nodeEnv !== "production";
    let state: ChallengeState | undefined;
    let entry = {
      siteKey: parsed.data.sitekey ?? "",
      action: parsed.data.action,
      parentOrigin: null as string | null,
      sessionId: parsed.data.session,
      accessible: parsed.data.accessible,
      testMode,
    };
    if (parsed.data.session) {
      const session = challenges.getSession(parsed.data.session);
      if (!session) {
        return reply.code(410).type("text/html").send(errorPage(410, "会话已过期"));
      }
      const site = getSite(config, session.siteKey);
      if (!site || !siteAllowsAction(site, session.action)) {
        return reply.code(403).type("text/html").send(errorPage(403, "会话不可用"));
      }
      if (!siteAllowsOrigin(site, session.parentOrigin)) {
        return reply.code(403).type("text/html").send(errorPage(403, "嵌入来源未授权"));
      }
      testMode = session.testMode && config.nodeEnv !== "production";
      entry = {
        siteKey: session.siteKey,
        action: session.action,
        parentOrigin: session.parentOrigin,
        sessionId: session.id,
        accessible: parsed.data.accessible || session.accessible,
        testMode,
      };
      if (parsed.data.launch) {
        state = challenges.currentState(session.id);
      }
    } else {
      const siteKey = parsed.data.sitekey;
      const site = siteKey ? getSite(config, siteKey) : undefined;
      if (!site || !siteKey) {
        return reply.code(404).type("text/html").send(errorPage(404, "站点密钥无效"));
      }
      if (!siteAllowsAction(site, parsed.data.action)) {
        return reply.code(403).type("text/html").send(errorPage(403, "动作未授权"));
      }

      const refererOrigin = requestOrigin(request.headers.origin, request.headers.referer);
      const requestedParent = parsed.data.parentOrigin
        ? requestOrigin(parsed.data.parentOrigin, undefined)
        : null;
      const parentOrigin =
        requestedParent && siteAllowsOrigin(site, requestedParent) ? requestedParent : refererOrigin;
      if (!siteAllowsOrigin(site, parentOrigin)) {
        return reply.code(403).type("text/html").send(errorPage(403, "嵌入来源未授权"));
      }
      entry = {
        siteKey,
        action: parsed.data.action,
        parentOrigin,
        sessionId: undefined,
        accessible: parsed.data.accessible,
        testMode,
      };
      if (!parsed.data.launch) {
        reply
          .type("text/html; charset=utf-8")
          .header("Cache-Control", "no-store")
          .header("X-Robots-Tag", "noindex, nofollow")
          .header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors *; base-uri 'none'; form-action 'self'")
          .header("Permissions-Policy", "camera=(self), microphone=(self)");
        return reply.send(entryHtml(entry, config));
      }
      if (
        parsed.data.challengeType === "turnstile" &&
        (!config.turnstileSiteKey || !config.turnstileSecretKey)
      ) {
        return reply.code(400).type("text/html").send(errorPage(400, "Turnstile 尚未配置"));
      }
      const risk = riskTracker.assess(
        { headers: request.headers, ip: request.ip },
        config.nodeEnv === "production",
        parsed.data.risk,
      );

      state = challenges.create(
        siteKey,
        parsed.data.action,
        parentOrigin,
        parsed.data.accessible,
        parsed.data.challengeType,
        risk.level,
        parsed.data.steps,
        testMode,
        deviceClassFor(request),
      );
    }
    if (!parsed.data.launch) {
      reply
        .type("text/html; charset=utf-8")
        .header("Cache-Control", "no-store")
        .header("X-Robots-Tag", "noindex, nofollow")
        .header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors *; base-uri 'none'; form-action 'self'")
        .header("Permissions-Policy", "camera=(self), microphone=(self)");
      return reply.send(entryHtml(entry, config));
    }
    if (!state) {
      return reply.code(410).type("text/html").send(errorPage(410, "挑战已过期"));
    }
    reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("X-Robots-Tag", "noindex, nofollow")
      .header("Content-Security-Policy", "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; worker-src 'self' blob:; frame-ancestors *; base-uri 'none'; form-action 'self'")
      .header("Permissions-Policy", "camera=(self), microphone=(self)");
    return reply.send(embedHtml(state, config, testMode));
  });

  app.post("/v1/siteverify", async (request, reply) => {
    if (!apiVersionAllowed(request)) {
      return reply.code(400).send({ error: "API_VERSION_MISMATCH" });
    }
    const parsed = siteverifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, errorCodes: ["INVALID_REQUEST"] });
    }

    const verification = tokens.verify(parsed.data.response, {
      ...(parsed.data.action ? { action: parsed.data.action } : {}),
    });
    if (!verification.ok) {
      return reply.send({ success: false, errorCodes: [verification.code] });
    }

    const site = getSite(config, verification.payload.siteKey);
    if (!site || !secretsMatch(site.secret, parsed.data.secret)) {
      return reply.send({ success: false, errorCodes: ["INVALID_SITE_SECRET"] });
    }
    if (!siteAllowsAction(site, verification.payload.action)) {
      return reply.send({ success: false, errorCodes: ["ACTION_NOT_ALLOWED"] });
    }
    if (!tokens.consume(verification.payload.jti)) {
      return reply.send({ success: false, errorCodes: ["TOKEN_REPLAYED"] });
    }

    return {
      success: true,
      siteKey: verification.payload.siteKey,
      action: verification.payload.action,
      assuranceLevel: verification.payload.assuranceLevel,
      challengeTs: new Date(verification.payload.iat * 1000).toISOString(),
      errorCodes: [],
    };
  });

  await registerPlatform(app, config, platformStore);

  return { app, config, challenges, tokens, platformStore };
}

function findState(challenges: ChallengeStore, request: FastifyRequest): ChallengeState | undefined {
  const { id } = request.params as { id: string };
  return challenges.getForAsset(id);
}

function logVerification(
  request: FastifyRequest,
  state: ChallengeState,
  result: VerificationResult,
): void {
  if (result.kind === "verified") {
    request.log.info(
      { event: "challenge.verified", challengeId: state.id, siteKey: state.siteKey },
      "challenge verified",
    );
    return;
  }
  if (result.kind === "preview") {
    request.log.info(
      {
        event: "challenge.preview_completed",
        challengeId: state.id,
        type: state.type,
      },
      "challenge preview completed",
    );
    return;
  }
  if (result.kind === "step") {
    request.log.info(
      {
        event: "challenge.step",
        challengeId: state.id,
        sessionId: result.session.id,
        siteKey: state.siteKey,
        step: result.session.currentStep,
        totalSteps: result.session.totalSteps,
      },
      "challenge step passed",
    );
    return;
  }
  if (result.failure.code === "HONEYPOT_TRIGGERED") {
    request.log.warn(
      { event: "challenge.honeypot", challengeId: state.id, siteKey: state.siteKey },
      "decoy text submitted",
    );
    return;
  }
  request.log.info(
    { event: "challenge.failed", challengeId: state.id, siteKey: state.siteKey, code: result.failure.code },
    "challenge failed",
  );
}
