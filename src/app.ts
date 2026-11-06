import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { renderAnimalSequenceWave, renderDtmfWave } from "./audio.js";
import { ChallengeStore, RISK_STEPS, type VerificationResult } from "./challenge.js";
import { loadConfig } from "./config.js";
import { renderGridItemSvg, renderTargetSvg } from "./grid.js";
import { renderChallengeSvg } from "./render.js";
import {
  getSite,
  requestOrigin,
  secretsMatch,
  siteAllowsAction,
  siteAllowsOrigin,
} from "./site.js";
import { TokenService } from "./token.js";
import type { AppConfig, ChallengeState } from "./types.js";

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
] as const;

const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;

const createSchema = z.object({
  siteKey: z.string().min(3).max(128),
  action: z.string().min(1).max(64).default("submit"),
  accessible: z.boolean().default(false),
  challengeType: z.enum(CHALLENGE_TYPES).optional(),
  risk: z.enum(RISK_LEVELS).default("low"),
  steps: z.number().int().min(1).max(8).optional(),
});

const verifySchema = z.object({
  answer: z.string().max(32).optional(),
  selectedIndices: z.array(z.number().int().min(0).max(8)).max(9).optional(),
  holdMs: z.number().int().min(0).max(9_000).optional(),
  distance: z.number().min(0).max(1_200).optional(),
  market: z
    .object({
      buyIndex: z.number().int().min(0).max(200),
      sellIndex: z.number().int().min(0).max(200),
    })
    .optional(),
  point: z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
      elapsedMs: z.number().int().min(0).max(9_000),
    })
    .optional(),
});

const embedSchema = z.object({
  sitekey: z.string().min(3).max(128).optional(),
  session: z.string().min(8).max(128).optional(),
  action: z.string().min(1).max(64).default("submit"),
  parentOrigin: z.string().url().optional(),
  challengeType: z.enum(CHALLENGE_TYPES).optional(),
  risk: z.enum(RISK_LEVELS).default("low"),
  steps: z.coerce.number().int().min(1).max(8).optional(),
  accessible: z.enum(["0", "1"]).optional().transform((value) => value === "1"),
  test: z.enum(["0", "1"]).optional().transform((value) => value === "1"),
}).refine((value) => Boolean(value.sitekey || value.session), {
  message: "sitekey or session is required",
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
      prompt: "按住空格键，同时向右拖动滑块并保持片刻",
      requiredDistance: state.keyPointer.requiredDistance,
      requiredHoldMs: state.keyPointer.requiredHoldMs,
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
      prompt: "在低点买入，在高点卖出",
      market: {
        seed: state.marketTrade.seed,
        width: state.marketTrade.width,
        height: state.marketTrade.height,
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
            <span class="oc-tile-check" aria-hidden="true">✓</span>
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
          <p class="oc-kicker">动态覆盖</p>
          <p class="oc-prompt" id="oc-prompt">拖动下方的圆形遮罩，覆盖画面中的蓝色移动目标</p>
        </div>
        <span class="oc-motion-badge">实时</span>
      </div>
      <div class="oc-motion-wrap" data-width="${state.motion.width}" data-height="${state.motion.height}" data-seed="${state.motion.seed}" data-duration="${state.motion.durationMs}">
        <canvas id="oc-motion-canvas" width="${state.motion.width}" height="${state.motion.height}" aria-label="移动目标覆盖区域"></canvas>
      </div>
      <p class="oc-helper" id="oc-motion-help">按住并拖动遮罩，持续覆盖目标片刻。</p>
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
          <p class="oc-kicker">听觉序列</p>
          <p class="oc-prompt" id="oc-prompt">听音频，选择猫叫之后的第一个动物</p>
        </div>
        <span class="oc-difficulty">声音</span>
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
          <p class="oc-kicker">计算挑战</p>
          <p class="oc-prompt" id="oc-prompt">计算下列算式</p>
        </div>
        <span class="oc-difficulty">高成本</span>
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
          <p class="oc-kicker">双输入验证</p>
          <p class="oc-prompt" id="oc-prompt">按住空格键，同时向右拖动</p>
        </div>
        <span class="oc-difficulty">键盘 + 指针</span>
      </div>
      <div class="oc-gesture-wrap" data-required-distance="${state.keyPointer.requiredDistance}" data-required-hold="${state.keyPointer.requiredHoldMs}">
        <div class="oc-keycap" aria-hidden="true">Space</div>
        <div class="oc-gesture-track" id="oc-gesture-track" role="slider" tabindex="0"
             aria-label="按住空格键并拖到右侧" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
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
          <p class="oc-kicker">序列记忆</p>
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
          <p class="oc-kicker">瞬时计数</p>
          <p class="oc-prompt" id="oc-prompt">记住画面短暂出现的圆点数量</p>
        </div>
        <span class="oc-difficulty">约 1 秒</span>
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
    return `
      <div class="oc-prompt-row">
        <div>
          <p class="oc-kicker">市场时机</p>
          <p class="oc-prompt" id="oc-prompt">在低点买入，在高点卖出</p>
        </div>
        <span class="oc-difficulty">微型游戏</span>
      </div>
      <div class="oc-market-wrap">
        <canvas id="oc-market-canvas" width="${state.marketTrade.width}" height="${state.marketTrade.height}"
                data-seed="${state.marketTrade.seed}"
                aria-label="股票价格走势图"></canvas>
      </div>
      <div class="oc-trade-actions" role="group" aria-label="交易方向">
        <button class="oc-trade-button is-active" id="oc-market-buy" type="button" aria-pressed="true">买入</button>
        <button class="oc-trade-button" id="oc-market-sell" type="button" aria-pressed="false">卖出</button>
      </div>
      <p class="oc-helper" id="oc-market-help">先在图表上选择买入点，再选择卖出点。</p>
      <div class="oc-controls oc-controls-end">
        <button class="oc-submit" id="oc-submit" type="submit" disabled>验证</button>
      </div>`;
  }

  const backgroundColor = escapeHtml(state.backgroundColor ?? "#172033");
  const inverseColor = escapeHtml(state.inverseColor ?? "#f4e0cc");
  return `
    <div class="oc-prompt-row">
      <div>
        <p class="oc-kicker">反色遮挡</p>
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
  <script defer src="${escapeHtml(apiBase(config))}/frame.js"></script>
</head>
<body class="oc-frame" data-challenge-type="${escapeHtml(state.type)}" data-test-mode="${testMode ? "1" : "0"}" data-risk="${escapeHtml(state.risk ?? "low")}">
  <main class="oc-shell" data-challenge-id="${escapeHtml(state.id)}" data-site-key="${escapeHtml(state.siteKey)}" data-action="${escapeHtml(state.action)}" data-session-id="${escapeHtml(state.sessionId ?? "")}" data-parent-origin="${escapeHtml(parentOrigin)}">
    <form class="oc-card" id="oc-form" novalidate>
      <header class="oc-header">
        <div class="oc-brand">
          <span class="oc-brand-mark" aria-hidden="true"></span>
          <span>OxygenChallenge</span>
        </div>
        <div class="oc-tools">
          ${state.type === "inverse_occlusion" ? `
          <button class="oc-icon-button" id="oc-audio" type="button" aria-label="播放听觉验证码" title="播放听觉验证码"></button>` : ""}
          <button class="oc-icon-button" id="oc-refresh" type="button" aria-label="换一道挑战" title="换一道挑战"></button>
        </div>
      </header>
      <div class="oc-challenge">
        ${challengeBody(state, config)}
      </div>
      <footer class="oc-footer">
        <span class="oc-brand-note">安全验证由 OxygenChallenge 提供</span>
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

export type BuildAppOptions = {
  config?: AppConfig;
  publicDir?: string;
  logger?: boolean;
};

export async function buildApp(options: BuildAppOptions = {}): Promise<{
  app: FastifyInstance;
  config: AppConfig;
  challenges: ChallengeStore;
  tokens: TokenService;
}> {
  const config = options.config ?? loadConfig();
  const tokens = new TokenService(config.publicOrigin, config.tokenTtlSeconds, config.tokenSeed);
  const challenges = new ChallengeStore(config, tokens);
  const app = Fastify({
    logger: options.logger === false ? false : { level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: 16 * 1024,
    trustProxy: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'none'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:"],
        "media-src": ["'self'"],
        "connect-src": ["'self'"],
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
    reply.type("application/json");
    return {
      name: "OxygenChallenge",
      version: "v26.0-alpha.3",
      mode: "api-only",
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
    };
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

    const state = challenges.create(
      parsed.data.siteKey,
      parsed.data.action,
      origin,
      parsed.data.accessible,
      parsed.data.challengeType,
      parsed.data.risk,
      parsed.data.steps,
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

    const result = challenges.verify(state.id, {
      ...(parsed.data.answer ? { answer: parsed.data.answer } : {}),
      ...(parsed.data.selectedIndices ? { selectedIndices: parsed.data.selectedIndices } : {}),
      ...(parsed.data.holdMs !== undefined ? { holdMs: parsed.data.holdMs } : {}),
      ...(parsed.data.distance !== undefined ? { distance: parsed.data.distance } : {}),
      ...(parsed.data.market ? { market: parsed.data.market } : {}),
      ...(parsed.data.point ? { point: parsed.data.point } : {}),
    });
    logVerification(request, state, result);
    if (result.kind === "verified") {
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
        nextEmbedUrl: `${apiBase(config)}/embed?session=${encodeURIComponent(result.session.id)}${
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
      state = challenges.currentState(session.id);
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

      state = challenges.create(
        siteKey,
        parsed.data.action,
        parentOrigin,
        parsed.data.accessible,
        parsed.data.challengeType,
        parsed.data.risk,
        parsed.data.steps,
        testMode,
      );
    }
    if (!state) {
      return reply.code(410).type("text/html").send(errorPage(410, "挑战已过期"));
    }
    reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("X-Robots-Tag", "noindex, nofollow")
      .header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-ancestors *; base-uri 'none'; form-action 'self'");
    return reply.send(embedHtml(state, config, testMode));
  });

  app.post("/v1/siteverify", async (request, reply) => {
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

  return { app, config, challenges, tokens };
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
