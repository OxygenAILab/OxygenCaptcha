import {
  Accessibility,
  Bird,
  Camera,
  Cat,
  Check,
  createElement,
  Dog,
  Eye,
  Heart,
  Mic,
  Moon,
  Play,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Star,
  Sun,
  Volume2,
} from "lucide";
import { zzfx } from "zzfx";
import {
  FilesetResolver,
  HandLandmarker,
} from "../../vendor/mediapipe-tasks-vision/vision_bundle.mjs";
import {
  classifyHand,
  HAND_CONNECTIONS,
  type HandLandmark,
} from "../gestures.js";
import {
  countFlashPoints,
  countFromSeed,
  marketPrices,
  PATTERN_ICON_KEYS,
  patternSequence,
} from "../microgames.js";

type MotionData = {
  width: number;
  height: number;
  seed: number;
  duration: number;
};

type MotionPoint = { x: number; y: number; elapsedMs: number };

type TurnstileApi = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: "light";
      language: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __oxygenHandTest?: (
      observations: Array<{
        action: "open" | "fist" | "peace";
        durationMs: number;
      }>,
    ) => void;
    __oxygenSpeechTest?: (takes: number[][][]) => void;
  }
}

const form = document.querySelector<HTMLFormElement>("#oc-form");
const shell = document.querySelector<HTMLElement>(".oc-shell");
const body = document.body;
const input = document.querySelector<HTMLInputElement>("#oc-answer");
const submit = document.querySelector<HTMLButtonElement>("#oc-submit");
const refresh = document.querySelector<HTMLButtonElement>("#oc-refresh");
const audioButton = document.querySelector<HTMLButtonElement>("#oc-audio");
const accessibleButton = document.querySelector<HTMLButtonElement>("#oc-accessible");
const player = document.querySelector<HTMLAudioElement>("#oc-player");
const status = document.querySelector<HTMLElement>("#oc-status");
const grid = document.querySelector<HTMLElement>("#oc-grid");
const choices = document.querySelector<HTMLElement>("#oc-choices");
const playSequenceButton = document.querySelector<HTMLButtonElement>("#oc-play-sequence");
const patternGrid = document.querySelector<HTMLElement>("#oc-pattern-grid");
const patternPlayButton = document.querySelector<HTMLButtonElement>("#oc-pattern-play");
const countCanvas = document.querySelector<HTMLCanvasElement>("#oc-count-canvas");
const countStartButton = document.querySelector<HTMLButtonElement>("#oc-count-start");
const marketCanvas = document.querySelector<HTMLCanvasElement>("#oc-market-canvas");
const marketBuyButton = document.querySelector<HTMLButtonElement>("#oc-market-buy");
const marketSellButton = document.querySelector<HTMLButtonElement>("#oc-market-sell");
const marketHelp = document.querySelector<HTMLElement>("#oc-market-help");
const humanCheck = document.querySelector<HTMLElement>("#oc-human-check");
const humanInput = document.querySelector<HTMLInputElement>("#oc-human-input");
const rotateObject = document.querySelector<HTMLElement>("#oc-rotate-object");
const rotateSlider = document.querySelector<HTMLInputElement>("#oc-rotate-slider");
const rotateValue = document.querySelector<HTMLOutputElement>("#oc-rotate-value");
const turnstileShell = document.querySelector<HTMLElement>("#oc-turnstile");
const handVideo = document.querySelector<HTMLVideoElement>("#oc-hand-video");
const handOverlay = document.querySelector<HTMLCanvasElement>("#oc-hand-overlay");
const handPlaceholder = document.querySelector<HTMLElement>("#oc-camera-placeholder");
const handStart = document.querySelector<HTMLButtonElement>("#oc-hand-start");
const handHelp = document.querySelector<HTMLElement>("#oc-hand-help");
const actionSequence = document.querySelector<HTMLElement>("#oc-action-sequence");
const speechPhrase = document.querySelector<HTMLElement>("#oc-speech-phrase");
const speechTakes = document.querySelector<HTMLElement>("#oc-speech-takes");
const speechWave = document.querySelector<HTMLCanvasElement>("#oc-speech-wave");
const speechRecord = document.querySelector<HTMLButtonElement>("#oc-speech-record");
const speechHelp = document.querySelector<HTMLElement>("#oc-speech-help");
const gestureWrap = document.querySelector<HTMLElement>(".oc-gesture-wrap");
const motionWrap = document.querySelector<HTMLElement>(".oc-motion-wrap");
const motionCanvas = document.querySelector<HTMLCanvasElement>("#oc-motion-canvas");
const motionHelp = document.querySelector<HTMLElement>("#oc-motion-help");
const type = body.dataset.challengeType ?? "inverse_occlusion";
const testMode = body.dataset.testMode === "1";
const pageStartedAt = performance.now();
const selected = new Set<number>();
let audioChoice: string | null = null;
let semanticChoice: string | null = null;
let turnstileToken: string | null = null;
let handEvidence: Array<{ action: "open" | "fist" | "peace"; durationMs: number }> =
  [];
let audioTakes: number[][][] = [];
let rotateAngle = Number.parseFloat(rotateSlider?.value ?? "0");
let patternSelection: number[] = [];
let marketBuyIndex: number | null = null;
let marketSellIndex: number | null = null;
let marketMode: "buy" | "sell" = "buy";
let keyPointerEvidence: { holdMs: number; distance: number } | null = null;
let keyPointerReady = false;
let verified = false;
let motionPoint: MotionPoint | null = null;
let motionReady = false;
let lastReportedHeight = 0;
let transitioning = false;

function play(effect: "success" | "error" | "click"): void {
  try {
    if (effect === "success") {
      zzfx(...([, , 660, 0.02, 0.08, 0.18, 1, 1.6, , , , , , , , , 0.02] as unknown as number[]));
    } else if (effect === "error") {
      zzfx(...([, , 190, 0.02, 0.06, 0.18, 1, 0.7, , , , , , , , , 0.02] as unknown as number[]));
    } else {
      zzfx(...([, , 420, 0.01, 0.02, 0.04, 1, 1, , , , , , , , , 0.01] as unknown as number[]));
    }
  } catch {
    // Sound is feedback only; a blocked AudioContext never blocks verification.
  }
}

function appendIcon(button: Element | null, icon: Parameters<typeof createElement>[0]): void {
  if (!button) {
    return;
  }
  const element = createElement(icon, {
    width: 18,
    height: 18,
    "stroke-width": 1.8,
    "aria-hidden": "true",
  });
  button.prepend(element);
}

function parentOrigin(): string {
  const declared = shell?.dataset.parentOrigin;
  if (declared) {
    try {
      return new URL(declared).origin;
    } catch {
      return "*";
    }
  }
  if (document.referrer) {
    try {
      return new URL(document.referrer).origin;
    } catch {
      return "*";
    }
  }
  return "*";
}

function post(messageType: string, detail: Record<string, unknown>): void {
  window.parent.postMessage(
    {
      source: "oxygenchallenge",
      type: messageType,
      challengeId: shell?.dataset.challengeId,
      ...detail,
    },
    parentOrigin(),
  );
}

function setStatus(message: string, tone: "neutral" | "error" | "success" = "neutral"): void {
  if (!status) {
    return;
  }
  status.textContent = message;
  status.dataset.tone = tone;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function reportHeight(): void {
  const height = Math.ceil(document.documentElement.scrollHeight);
  if (height === lastReportedHeight) {
    return;
  }
  lastReportedHeight = height;
  post("resize", { height });
}

function reloadWithAccessible(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("session");
  url.searchParams.delete("risk");
  url.searchParams.delete("steps");
  url.searchParams.set("sitekey", shell?.dataset.siteKey ?? "");
  url.searchParams.set("action", shell?.dataset.action ?? "submit");
  url.searchParams.set("accessible", "1");
  url.searchParams.set("challengeType", "inverse_occlusion");
  window.location.href = url.toString();
}

function updateGrid(): void {
  if (!grid) {
    return;
  }
  grid.querySelectorAll<HTMLButtonElement>(".oc-tile").forEach((tile) => {
    const index = Number.parseInt(tile.dataset.index ?? "-1", 10);
    const active = selected.has(index);
    tile.classList.toggle("is-selected", active);
    tile.setAttribute("aria-pressed", String(active));
  });
}

function initGrid(): void {
  if (!grid) {
    return;
  }
  grid.querySelectorAll<HTMLButtonElement>(".oc-tile").forEach((tile) => {
    const check = tile.querySelector(".oc-tile-check");
    if (check && !check.firstElementChild) {
      check.prepend(
        createElement(Check, {
          width: 18,
          height: 18,
          "stroke-width": 2.4,
          "aria-hidden": "true",
        }),
      );
    }
    tile.addEventListener("click", () => {
      const index = Number.parseInt(tile.dataset.index ?? "-1", 10);
      if (!Number.isInteger(index)) {
        return;
      }
      if (selected.has(index)) {
        selected.delete(index);
      } else {
        selected.add(index);
      }
      play("click");
      setStatus("");
      updateGrid();
    });
  });
}

function initAudioSequence(): void {
  if (type !== "audio_sequence") {
    return;
  }
  appendIcon(playSequenceButton, Play);
  const choiceIcons = { cat: Cat, dog: Dog, bird: Bird };

  choices?.querySelectorAll<HTMLButtonElement>(".oc-choice").forEach((choice) => {
    const key = choice.dataset.choice;
    const icon = key === "cat" || key === "dog" || key === "bird" ? choiceIcons[key] : null;
    const iconSlot = choice.querySelector(".oc-choice-icon");
    if (icon && iconSlot && !iconSlot.firstElementChild) {
      iconSlot.append(
        createElement(icon, {
          width: 24,
          height: 24,
          "stroke-width": 1.8,
          "aria-hidden": "true",
        }),
      );
    }
    const checkSlot = choice.querySelector(".oc-choice-check");
    if (checkSlot && !checkSlot.firstElementChild) {
      checkSlot.append(
        createElement(Check, {
          width: 16,
          height: 16,
          "stroke-width": 2.4,
          "aria-hidden": "true",
        }),
      );
    }
    choice.addEventListener("click", () => {
      const nextChoice = choice.dataset.choice ?? null;
      audioChoice = audioChoice === nextChoice ? null : nextChoice;
      choices.querySelectorAll<HTMLButtonElement>(".oc-choice").forEach((item) => {
        const active = item.dataset.choice === audioChoice;
        item.classList.toggle("is-selected", active);
        item.setAttribute("aria-pressed", String(active));
      });
      if (submit) {
        submit.disabled = audioChoice === null;
      }
      setStatus("");
      play("click");
    });
  });

  playSequenceButton?.addEventListener("click", () => {
    if (!player || !shell) {
      return;
    }
    play("click");
    player.src = `/v1/challenges/${shell.dataset.challengeId}/sequence.wav`;
    setStatus("正在播放声音序列…");
    void player.play().catch(() => {
      setStatus("无法播放音频，请检查设备设置。", "error");
    });
  });
}

function initSemanticPick(): void {
  if (type !== "semantic_pick" || !choices) {
    return;
  }
  choices.querySelectorAll<HTMLButtonElement>(".oc-choice").forEach((choice) => {
    const check = choice.querySelector(".oc-choice-check");
    if (check && !check.firstElementChild) {
      check.append(
        createElement(Check, {
          width: 16,
          height: 16,
          "stroke-width": 2.4,
          "aria-hidden": "true",
        }),
      );
    }
    choice.addEventListener("click", () => {
      semanticChoice = choice.dataset.choice ?? null;
      choices.querySelectorAll<HTMLButtonElement>(".oc-choice").forEach((item) => {
        const active = item.dataset.choice === semanticChoice;
        item.classList.toggle("is-selected", active);
        item.setAttribute("aria-pressed", String(active));
      });
      if (submit) {
        submit.disabled = semanticChoice === null;
      }
      setStatus("");
      play("click");
    });
  });
}

function initHumanCheck(): void {
  if (type !== "human_check" || !humanCheck || !humanInput || !submit) {
    return;
  }
  const minimum = Number.parseInt(humanCheck.dataset.minDwell ?? "700", 10);
  const observedAt = performance.now();
  humanInput.addEventListener("change", () => {
    if (!humanInput.checked) {
      submit.disabled = true;
      return;
    }
    const remaining = Math.max(0, minimum - (performance.now() - observedAt));
    setStatus("正在完成交互检查…");
    window.setTimeout(() => {
      submit.disabled = false;
      setStatus("交互检查完成。", "success");
    }, remaining);
  });
}

function initRotateAlign(): void {
  if (
    type !== "rotate_align" ||
    !rotateObject ||
    !rotateSlider ||
    !rotateValue
  ) {
    return;
  }
  rotateAngle = Number.parseFloat(rotateSlider.value);
  rotateObject.style.transform = `rotate(${rotateAngle}deg)`;
  rotateSlider.addEventListener("input", () => {
    rotateAngle = Number.parseFloat(rotateSlider.value);
    rotateObject.style.transform = `rotate(${rotateAngle}deg)`;
    rotateValue.value = `${Math.round(rotateAngle)}°`;
    setStatus("");
  });
}

function initTurnstile(): void {
  if (type !== "turnstile" || !turnstileShell || !submit) {
    return;
  }
  const started = performance.now();
  const render = () => {
    const siteKey = turnstileShell.dataset.sitekey ?? "";
    if (!window.turnstile || !siteKey) {
      if (performance.now() - started > 12_000) {
        setStatus("Cloudflare 验证组件加载失败。", "error");
        return;
      }
      window.setTimeout(render, 100);
      return;
    }
    window.turnstile.render(turnstileShell, {
      sitekey: siteKey,
      theme: "light",
      language: "zh-CN",
      callback: (token) => {
        turnstileToken = token;
        submit.disabled = false;
        setStatus("Cloudflare 验证完成。", "success");
      },
      "expired-callback": () => {
        turnstileToken = null;
        submit.disabled = true;
        setStatus("Cloudflare 验证已过期，请重试。", "error");
      },
      "error-callback": () => {
        turnstileToken = null;
        submit.disabled = true;
        setStatus("Cloudflare 验证失败，请重试。", "error");
      },
    });
  };
  render();
}

function drawHandSkeleton(
  canvas: HTMLCanvasElement,
  hands: HandLandmark[][],
): void {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineWidth = 2;
  context.strokeStyle = "#2f6fed";
  context.fillStyle = "#ffffff";
  for (const landmarks of hands) {
    for (const [fromIndex, toIndex] of HAND_CONNECTIONS) {
      const from = landmarks[fromIndex];
      const to = landmarks[toIndex];
      if (!from || !to) {
        continue;
      }
      context.beginPath();
      context.moveTo(from.x * canvas.width, from.y * canvas.height);
      context.lineTo(to.x * canvas.width, to.y * canvas.height);
      context.stroke();
    }
    for (const landmark of landmarks) {
      context.beginPath();
      context.arc(
        landmark.x * canvas.width,
        landmark.y * canvas.height,
        3.2,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  }
}

function initHandMotion(): void {
  if (
    type !== "hand_motion" ||
    !handVideo ||
    !handOverlay ||
    !handStart ||
    !actionSequence ||
    !submit
  ) {
    return;
  }
  const sequence = (actionSequence.dataset.sequence ?? "")
    .split(",")
    .filter(
      (action): action is "open" | "fist" | "peace" =>
        action === "open" || action === "fist" || action === "peace",
    );
  const holdMs = Number.parseInt(actionSequence.dataset.hold ?? "450", 10);
  let stream: MediaStream | null = null;
  let landmarker: HandLandmarker | null = null;
  let running = false;
  let currentIndex = 0;
  let holdStartedAt = 0;
  let lastVideoTime = -1;
  const observations: Array<{
    action: "open" | "fist" | "peace";
    durationMs: number;
  }> = [];

  appendIcon(handStart, Camera);
  const setCurrentAction = () => {
    actionSequence.querySelectorAll<HTMLElement>(".oc-action-chip").forEach((chip, index) => {
      chip.classList.toggle("is-complete", index < currentIndex);
      chip.classList.toggle("is-current", index === currentIndex);
    });
  };
  setCurrentAction();

  const stop = () => {
    running = false;
    for (const track of stream?.getTracks() ?? []) {
      track.stop();
    }
    stream = null;
    landmarker?.close();
    landmarker = null;
  };

  const detect = () => {
    if (!running) {
      return;
    }
    if (
      landmarker &&
      handVideo.readyState >= 2 &&
      handVideo.currentTime !== lastVideoTime
    ) {
      lastVideoTime = handVideo.currentTime;
      try {
        const result = landmarker.detectForVideo(handVideo, performance.now());
        const hands = result.landmarks as HandLandmark[][];
        drawHandSkeleton(handOverlay, hands);
        const action = classifyHand(hands[0] ?? []);
        const expected = sequence[currentIndex];
        if (action !== "unknown" && action === expected) {
          if (holdStartedAt === 0) {
            holdStartedAt = performance.now();
          }
          const held = Math.round(performance.now() - holdStartedAt);
          if (handHelp) {
            handHelp.textContent = `保持${action === "open" ? "张开手掌" : action === "fist" ? "握拳" : "剪刀手"} ${Math.min(100, Math.round((held / holdMs) * 100))}%`;
          }
          if (held >= holdMs) {
            observations.push({ action, durationMs: held });
            currentIndex += 1;
            holdStartedAt = 0;
            setCurrentAction();
            if (currentIndex >= sequence.length) {
              handEvidence = observations;
              stop();
              if (handPlaceholder) {
                handPlaceholder.textContent = "动作序列已完成";
                handPlaceholder.hidden = false;
              }
              submit.disabled = false;
              setStatus("动态手势已完成，可以验证。", "success");
              return;
            }
            setStatus(`动作 ${currentIndex} / ${sequence.length} 已完成。`, "success");
          }
        } else {
          holdStartedAt = 0;
          if (handHelp) {
            handHelp.textContent = `请完成：${expected === "open" ? "张开手掌" : expected === "fist" ? "握拳" : "剪刀手"}`;
          }
        }
      } catch {
        setStatus("手势识别失败，请调整光线后重试。", "error");
      }
    }
    requestAnimationFrame(detect);
  };

  handStart.addEventListener("click", async () => {
    if (running) {
      return;
    }
    handStart.disabled = true;
    setStatus("正在请求摄像头…");
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      handVideo.srcObject = stream;
      await handVideo.play();
      if (handPlaceholder) {
        handPlaceholder.hidden = true;
      }
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      try {
        landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: "/models/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      } catch {
        landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: "/models/hand_landmarker.task",
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
        });
      }
      running = true;
      setStatus("请按顺序完成手势。");
      requestAnimationFrame(detect);
    } catch (error) {
      stop();
      handStart.disabled = false;
      setStatus(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "摄像头权限被拒绝，可改用无障碍验证。"
          : "无法启用摄像头或手势模型。",
        "error",
      );
    }
  });

  if (testMode) {
    window.__oxygenHandTest = (testObservations) => {
      handEvidence = testObservations;
      submit.disabled = false;
      setStatus("测试手势已载入。", "success");
    };
  }
}

function drawSpeechWave(canvas: HTMLCanvasElement, values: number[]): void {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#edf2f8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#2f6fed";
  context.lineWidth = 1.5;
  context.beginPath();
  values.forEach((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * canvas.width;
    const y = canvas.height / 2 - value * canvas.height * 0.42;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.stroke();
}

function downsampleFrames(frames: number[][], maximum = 120): number[][] {
  if (frames.length <= maximum) {
    return frames;
  }
  return Array.from({ length: maximum }, (_, index) => {
    const frame = frames[Math.floor((index / maximum) * frames.length)];
    return frame ?? [];
  });
}

function initSpeechWave(): void {
  if (
    type !== "speech_wave" ||
    !speechPhrase ||
    !speechRecord ||
    !speechTakes ||
    !speechWave ||
    !submit
  ) {
    return;
  }
  const takeCount = Number.parseInt(speechPhrase.dataset.takeCount ?? "3", 10);
  let takes: number[][][] = [];
  let recording = false;
  let stream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let timer = 0;
  let frames: number[][] = [];
  let waveform: number[] = [];

  appendIcon(speechRecord, Mic);
  const updateCards = () => {
    speechTakes.querySelectorAll<HTMLElement>(".oc-speech-take").forEach((card, index) => {
      const status = card.querySelector("strong");
      const recorded = index < takes.length;
      card.classList.toggle("is-recorded", recorded);
      if (status) {
        status.textContent = recorded ? "已记录" : "未录制";
      }
    });
  };

  const finishTake = async () => {
    recording = false;
    window.clearInterval(timer);
    timer = 0;
    for (const track of stream?.getTracks() ?? []) {
      track.stop();
    }
    stream = null;
    await audioContext?.close();
    audioContext = null;
    const energyIndex = 6;
    const active = frames.filter((frame) => (frame[energyIndex] ?? 0) > 0.09);
    const trimmed = (active.length >= 12 ? active : frames).slice(0, 160);
    if (trimmed.length < 20) {
      setStatus("录制时间太短，请完整朗读整句。", "error");
      speechRecord.disabled = false;
      speechRecord.textContent = `录制第 ${takes.length + 1} 遍`;
      return;
    }
    takes.push(downsampleFrames(trimmed));
    updateCards();
    speechRecord.disabled = takes.length >= takeCount;
    speechRecord.textContent =
      takes.length >= takeCount ? "已完成录制" : `录制第 ${takes.length + 1} 遍`;
    if (takes.length >= takeCount) {
      audioTakes = takes;
      submit.disabled = false;
      setStatus("三遍录制完成，可以验证。", "success");
      if (speechHelp) {
        speechHelp.textContent = "频段特征已准备好，原始音频未上传。";
      }
    } else {
      setStatus(`第 ${takes.length} 遍已记录。`, "success");
    }
  };

  const startTake = async () => {
    if (takes.length >= takeCount) {
      takes = [];
      audioTakes = [];
      submit.disabled = true;
      updateCards();
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      const Context =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      audioContext = new Context();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.55;
      source.connect(analyser);
      const spectrum = new Uint8Array(analyser.frequencyBinCount);
      frames = [];
      waveform = [];
      recording = true;
      speechRecord.disabled = false;
      speechRecord.textContent = "停止本遍";
      setStatus(`正在录制第 ${takes.length + 1} 遍…`);
      timer = window.setInterval(() => {
        analyser.getByteFrequencyData(spectrum);
        const bands = Array.from({ length: 6 }, (_, band) => {
          const from = Math.floor((band / 6) ** 1.7 * spectrum.length);
          const to = Math.max(from + 1, Math.floor(((band + 1) / 6) ** 1.7 * spectrum.length));
          let total = 0;
          for (let index = from; index < to; index += 1) {
            total += spectrum[index] ?? 0;
          }
          return total / Math.max(1, to - from) / 255;
        });
        const energy =
          spectrum.reduce((total, value) => total + value, 0) /
          Math.max(1, spectrum.length) /
          255;
        frames.push([...bands, energy]);
        waveform.push(energy);
        if (waveform.length > 90) {
          waveform = waveform.slice(-90);
        }
        drawSpeechWave(speechWave, waveform);
      }, 50);
    } catch {
      recording = false;
      speechRecord.disabled = false;
      setStatus("无法访问麦克风，可改用无障碍验证。", "error");
    }
  };

  speechRecord.addEventListener("click", () => {
    if (recording) {
      void finishTake();
    } else {
      void startTake();
    }
  });
  updateCards();

  if (testMode) {
    window.__oxygenSpeechTest = (featureTakes: number[][][]) => {
      takes = featureTakes;
      audioTakes = featureTakes;
      updateCards();
      speechRecord.disabled = true;
      speechRecord.textContent = "已完成录制";
      submit.disabled = false;
      setStatus("测试音频特征已载入。", "success");
      if (speechHelp) {
        speechHelp.textContent = "频段特征已准备好，原始音频未上传。";
      }
    };
  }
}

function initPatternMemory(): void {
  if (!patternGrid || !patternPlayButton || !submit) {
    return;
  }
  const seed = Number.parseInt(patternGrid.dataset.seed ?? "1", 10);
  const length = Number.parseInt(patternGrid.dataset.length ?? "3", 10);
  const sequence = patternSequence(seed, length);
  const icons = { star: Star, heart: Heart, moon: Moon, sun: Sun };
  const buttons = Array.from(
    patternGrid.querySelectorAll<HTMLButtonElement>(".oc-pattern-button"),
  );
  let started = false;
  let playing = false;

  buttons.forEach((button, index) => {
    const icon = icons[PATTERN_ICON_KEYS[index] ?? "star"];
    button.append(
      createElement(icon, {
        width: 30,
        height: 30,
        "stroke-width": 1.8,
        "aria-hidden": "true",
      }),
    );
    button.addEventListener("click", () => {
      if (!started || playing) {
        return;
      }
      patternSelection.push(index);
      button.classList.add("is-flashing");
      window.setTimeout(() => button.classList.remove("is-flashing"), 220);
      play("click");
      const step = patternSelection.length - 1;
      if (patternSelection[step] !== sequence[step]) {
        patternSelection = [];
        submit.disabled = true;
        setStatus("顺序不正确，请重播后重试。", "error");
        started = false;
        buttons.forEach((item) => {
          item.disabled = true;
          item.classList.remove("is-selected");
        });
        return;
      }
      if (patternSelection.length === sequence.length) {
        submit.disabled = false;
        setStatus("序列正确，可以验证。", "success");
      } else {
        setStatus(`已输入 ${patternSelection.length} / ${sequence.length} 步。`);
      }
    });
  });

  appendIcon(patternPlayButton, Play);
  patternPlayButton.addEventListener("click", async () => {
    if (playing) {
      return;
    }
    playing = true;
    started = false;
    patternSelection = [];
    submit.disabled = true;
    setStatus("请观察闪烁顺序。");
    buttons.forEach((button) => {
      button.disabled = true;
      button.classList.remove("is-selected");
    });
    await wait(250);
    for (const index of sequence) {
      const button = buttons[index];
      if (!button) {
        continue;
      }
      button.classList.add("is-flashing");
      play("click");
      await wait(430);
      button.classList.remove("is-flashing");
      await wait(170);
    }
    buttons.forEach((button) => {
      button.disabled = false;
    });
    playing = false;
    started = true;
    setStatus("现在按相同顺序点击。");
  });
}

function initCountFlash(): void {
  if (!countCanvas) {
    return;
  }
  const context = countCanvas.getContext("2d");
  if (!context) {
    return;
  }
  const seed = Number.parseInt(countCanvas.dataset.seed ?? "1", 10);
  const revealMs = Number.parseInt(countCanvas.dataset.reveal ?? "900", 10);
  const points = countFlashPoints(seed, countFromSeed(seed));
  let running = false;

  const paintState = (message: string) => {
    context.clearRect(0, 0, countCanvas.width, countCanvas.height);
    context.fillStyle = "#edf2f8";
    context.fillRect(0, 0, countCanvas.width, countCanvas.height);
    context.fillStyle = "#637086";
    context.font = "600 16px system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText(message, countCanvas.width / 2, countCanvas.height / 2);
  };

  paintState("点击开始后观察");
  appendIcon(countStartButton, Eye);
  countStartButton?.addEventListener("click", async () => {
    if (running) {
      return;
    }
    running = true;
    if (input) {
      input.value = "";
      input.disabled = true;
    }
    if (submit) {
      submit.disabled = true;
    }
    if (countStartButton) {
      countStartButton.disabled = true;
    }
    setStatus("请观察并记住圆点数量。");
    context.clearRect(0, 0, countCanvas.width, countCanvas.height);
    context.fillStyle = "#edf2f8";
    context.fillRect(0, 0, countCanvas.width, countCanvas.height);
    context.fillStyle = "#2f6fed";
    for (const point of points) {
      context.beginPath();
      context.arc(
        point.x * countCanvas.width,
        point.y * countCanvas.height,
        point.radius,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    await wait(revealMs);
    paintState("已隐藏，请输入数量");
    if (input) {
      input.disabled = false;
      input.focus();
    }
    if (submit) {
      submit.disabled = false;
    }
    if (countStartButton) {
      countStartButton.disabled = false;
    }
    running = false;
    setStatus("圆点已隐藏，请输入数量。");
  });
}

function initMarketTrade(): void {
  if (!marketCanvas || !submit) {
    return;
  }
  const context = marketCanvas.getContext("2d");
  if (!context) {
    return;
  }
  const seed = Number.parseInt(marketCanvas.dataset.seed ?? "1", 10);
  const prices = marketPrices(seed);
  const padding = 18;

  const setMode = (mode: "buy" | "sell") => {
    marketMode = mode;
    marketBuyButton?.classList.toggle("is-active", mode === "buy");
    marketSellButton?.classList.toggle("is-active", mode === "sell");
    marketBuyButton?.setAttribute("aria-pressed", String(mode === "buy"));
    marketSellButton?.setAttribute("aria-pressed", String(mode === "sell"));
  };

  const draw = () => {
    context.clearRect(0, 0, marketCanvas.width, marketCanvas.height);
    context.fillStyle = "#f8fafc";
    context.fillRect(0, 0, marketCanvas.width, marketCanvas.height);
    context.strokeStyle = "rgba(23, 32, 51, 0.08)";
    context.lineWidth = 1;
    for (let line = 1; line < 4; line += 1) {
      const y = padding + ((marketCanvas.height - padding * 2) * line) / 4;
      context.beginPath();
      context.moveTo(padding, y);
      context.lineTo(marketCanvas.width - padding, y);
      context.stroke();
    }
    context.strokeStyle = "#2f6fed";
    context.lineWidth = 2.5;
    context.beginPath();
    prices.forEach((price, index) => {
      const x =
        padding +
        (index / Math.max(1, prices.length - 1)) *
          (marketCanvas.width - padding * 2);
      const y =
        padding +
        (1 - price) * (marketCanvas.height - padding * 2);
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.stroke();

    const drawMarker = (index: number, label: string) => {
      const price = prices[index] ?? 0;
      const x =
        padding +
        (index / Math.max(1, prices.length - 1)) *
          (marketCanvas.width - padding * 2);
      const y =
        padding +
        (1 - price) * (marketCanvas.height - padding * 2);
      context.fillStyle = label === "B" ? "#0f7b43" : "#c5221f";
      context.beginPath();
      context.arc(x, y, 7, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#ffffff";
      context.font = "700 10px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label, x, y + 0.5);
    };
    if (marketBuyIndex !== null) {
      drawMarker(marketBuyIndex, "B");
    }
    if (marketSellIndex !== null) {
      drawMarker(marketSellIndex, "S");
    }
  };

  const indexAt = (event: PointerEvent) => {
    const rect = marketCanvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const plotWidth = Math.max(1, rect.width - padding * 2);
    return Math.round(
      Math.max(
        0,
        Math.min(prices.length - 1, ((x - padding) / plotWidth) * (prices.length - 1)),
      ),
    );
  };

  marketCanvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    const index = indexAt(event);
    if (marketMode === "buy") {
      marketBuyIndex = index;
      marketSellIndex = null;
      setMode("sell");
      if (marketHelp) {
        marketHelp.textContent = "买入点已记录，请继续选择卖出点。";
      }
      setStatus("买入点已记录。");
    } else {
      if (marketBuyIndex === null) {
        setStatus("请先选择买入点。", "error");
        return;
      }
      if (index <= marketBuyIndex) {
        setStatus("卖出点必须晚于买入点。", "error");
        return;
      }
      marketSellIndex = index;
      submit.disabled = false;
      if (marketHelp) {
        marketHelp.textContent = "交易已记录，点击验证。";
      }
      setStatus("买入与卖出点已记录。", "success");
    }
    play("click");
    draw();
  });

  marketBuyButton?.addEventListener("click", () => {
    marketBuyIndex = null;
    marketSellIndex = null;
    submit.disabled = true;
    setMode("buy");
    setStatus("请选择新的买入点。");
    draw();
  });
  marketSellButton?.addEventListener("click", () => {
    if (marketBuyIndex === null) {
      setStatus("请先选择买入点。", "error");
      return;
    }
    marketSellIndex = null;
    submit.disabled = true;
    setMode("sell");
    setStatus("请选择卖出点。");
    draw();
  });
  draw();
}

function initKeyPointer(): void {
  if (!gestureWrap || !submit) {
    return;
  }
  const track = gestureWrap.querySelector<HTMLElement>("#oc-gesture-track");
  const knob = gestureWrap.querySelector<HTMLElement>(".oc-gesture-knob");
  const fill = gestureWrap.querySelector<HTMLElement>(".oc-gesture-fill");
  const help = document.querySelector<HTMLElement>("#oc-gesture-help");
  if (!track || !knob || !fill) {
    return;
  }

  const requiredDistance = Number.parseInt(gestureWrap.dataset.requiredDistance ?? "160", 10);
  const requiredHold = Number.parseInt(gestureWrap.dataset.requiredHold ?? "700", 10);
  let pointerDown = false;
  let spaceDown = false;
  let distance = 0;
  let holdStartedAt = 0;

  const setHelper = (message: string, tone: "neutral" | "error" | "success" = "neutral") => {
    if (help) {
      help.textContent = message;
    }
    setStatus("", tone);
  };

  const paint = () => {
    const maxDistance = Math.max(1, track.clientWidth - knob.offsetWidth - 8);
    const clamped = Math.max(0, Math.min(maxDistance, distance));
    knob.style.transform = `translateX(${clamped}px)`;
    fill.style.width = `${Math.round((clamped / maxDistance) * 100)}%`;
    track.setAttribute("aria-valuenow", String(Math.round((clamped / maxDistance) * 100)));
    return clamped;
  };

  const trackPointer = (event: PointerEvent) => {
    const rect = track.getBoundingClientRect();
    distance = event.clientX - rect.left - knob.offsetWidth / 2 - 4;
    paint();
  };

  const tick = (now: number) => {
    if (keyPointerReady) {
      return;
    }
    const currentDistance = paint();
    if (spaceDown && pointerDown && currentDistance >= requiredDistance) {
      if (holdStartedAt === 0) {
        holdStartedAt = now;
        setStatus("正在确认双输入持续时间…");
      }
      const heldFor = Math.round(now - holdStartedAt);
      if (heldFor >= requiredHold) {
        keyPointerReady = true;
        keyPointerEvidence = { holdMs: heldFor, distance: Math.round(currentDistance) };
        submit.disabled = false;
        if (help) {
          help.textContent = "双输入已确认，点击验证。";
        }
        setStatus("双输入成功，可以验证。", "success");
        return;
      }
    } else {
      holdStartedAt = 0;
    }
    requestAnimationFrame(tick);
  };

  window.addEventListener("keydown", (event) => {
    if (
      event.code !== "Space" ||
      event.repeat ||
      (event.target instanceof Element && event.target.closest("input, textarea, button"))
    ) {
      return;
    }
    event.preventDefault();
    spaceDown = true;
    setHelper("已按下空格键，继续拖动滑块。");
    requestAnimationFrame(tick);
  });

  window.addEventListener("keyup", (event) => {
    if (event.code !== "Space") {
      return;
    }
    spaceDown = false;
    if (!keyPointerReady) {
      holdStartedAt = 0;
      setHelper("空格键已松开，需要同时按住键盘与拖动滑块。", "error");
    }
  });

  track.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    pointerDown = true;
    track.setPointerCapture(event.pointerId);
    trackPointer(event);
    play("click");
    requestAnimationFrame(tick);
  });
  track.addEventListener("pointermove", (event) => {
    if (pointerDown) {
      trackPointer(event);
    }
  });
  const releasePointer = () => {
    pointerDown = false;
    if (!keyPointerReady) {
      holdStartedAt = 0;
      setHelper("继续按住空格键，并将滑块拖到右侧。", "error");
    }
  };
  track.addEventListener("pointerup", releasePointer);
  track.addEventListener("pointercancel", releasePointer);
  track.addEventListener("lostpointercapture", releasePointer);
}

function initMotion(): void {
  if (!motionWrap || !motionCanvas || !submit) {
    return;
  }

  const context = motionCanvas.getContext("2d");
  if (!context) {
    return;
  }
  const data: MotionData = {
    width: Number.parseInt(motionWrap.dataset.width ?? "360", 10),
    height: Number.parseInt(motionWrap.dataset.height ?? "150", 10),
    seed: Number.parseInt(motionWrap.dataset.seed ?? "1", 10),
    duration: Number.parseInt(motionWrap.dataset.duration ?? "9000", 10),
  };
  const start = performance.now();
  const cover = { x: data.width / 2, y: data.height / 2, visible: false };
  let dragging = false;
  let lastPoint: MotionPoint | null = null;
  let canSubmit = false;
  let holdStart = 0;

  const targetAt = (elapsedMs: number) => {
    const time = Math.max(0, Math.min(data.duration, elapsedMs));
    const phase = (data.seed % 360) * (Math.PI / 180);
    const t = time / data.duration;
    return {
      x: data.width * (0.5 + 0.34 * Math.sin(t * Math.PI * 2 + phase)),
      y: data.height * (0.5 + 0.25 * Math.sin(t * Math.PI * 4 + phase * 0.5)),
    };
  };

  const pointerPosition = (event: PointerEvent) => {
    const rect = motionCanvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(data.width, ((event.clientX - rect.left) / rect.width) * data.width)),
      y: Math.max(0, Math.min(data.height, ((event.clientY - rect.top) / rect.height) * data.height)),
    };
  };

  const draw = (now: number) => {
    const elapsed = now - start;
    const target = targetAt(elapsed);
    context.clearRect(0, 0, data.width, data.height);
    context.fillStyle = "#edf2f8";
    context.fillRect(0, 0, data.width, data.height);

    context.strokeStyle = "rgba(47, 111, 237, 0.08)";
    context.lineWidth = 1;
    for (let x = 20; x < data.width; x += 40) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, data.height);
      context.stroke();
    }
    for (let y = 20; y < data.height; y += 30) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(data.width, y);
      context.stroke();
    }

    for (let index = 0; index < 11; index += 1) {
      const drift = (elapsed / 27 + index * 47 + data.seed) % (data.width + 80) - 40;
      const y = 18 + ((index * 31 + data.seed) % (data.height - 36));
      context.fillStyle = "rgba(23, 32, 51, 0.12)";
      context.beginPath();
      context.arc(drift, y, index % 3 === 0 ? 3 : 2, 0, Math.PI * 2);
      context.fill();
    }

    context.fillStyle = "#2f6fed";
    context.beginPath();
    context.arc(target.x, target.y, 11, 0, Math.PI * 2);
    context.fill();
    if (document.body.dataset.testMode === "1" && motionCanvas) {
      motionCanvas.dataset.targetX = String(target.x);
      motionCanvas.dataset.targetY = String(target.y);
    }
    context.strokeStyle = "rgba(47, 111, 237, 0.28)";
    context.lineWidth = 8;
    context.beginPath();
    context.arc(target.x, target.y, 18, 0, Math.PI * 2);
    context.stroke();

    if (cover.visible) {
      context.fillStyle = "rgba(23, 32, 51, 0.72)";
      context.beginPath();
      context.arc(cover.x, cover.y, 34, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#ffffff";
      context.lineWidth = 2;
      context.stroke();
    }

    const overTarget = Math.hypot(cover.x - target.x, cover.y - target.y) <= 38;
    if (cover.visible && overTarget) {
      if (holdStart === 0) {
        holdStart = now;
      }
      const held = now - holdStart;
      if (held >= 450 && !canSubmit) {
        canSubmit = true;
        motionReady = true;
        submit.disabled = false;
        setStatus("覆盖成功，可以验证。", "success");
        if (motionHelp) {
          motionHelp.textContent = "目标已锁定，点击验证。";
        }
      }
    } else if (!canSubmit) {
      holdStart = 0;
    }

    if (!verified && elapsed < data.duration + 2_000) {
      requestAnimationFrame(draw);
    } else if (!verified) {
      setStatus("挑战已结束，请换一道题。", "error");
    }
  };

  const updateCover = (event: PointerEvent) => {
    const point = pointerPosition(event);
    cover.x = point.x;
    cover.y = point.y;
    cover.visible = true;
    lastPoint = { ...point, elapsedMs: Math.round(performance.now() - start) };
    motionPoint = lastPoint;
  };

  motionCanvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    dragging = true;
    setStatus("");
    motionCanvas.setPointerCapture(event.pointerId);
    updateCover(event);
    play("click");
  });
  motionCanvas.addEventListener("pointermove", (event) => {
    if (dragging) {
      updateCover(event);
    }
  });
  motionCanvas.addEventListener("pointerup", (event) => {
    dragging = false;
    updateCover(event);
  });
  motionCanvas.addEventListener("pointerleave", () => {
    if (!dragging) {
      cover.visible = false;
    }
  });
  motionCanvas.addEventListener("pointercancel", () => {
    dragging = false;
    cover.visible = false;
  });
  motionCanvas.addEventListener("lostpointercapture", () => {
    dragging = false;
    cover.visible = false;
  });

  submit.addEventListener("click", (event) => {
    if (!canSubmit || !lastPoint) {
      event.preventDefault();
      setStatus("请先持续覆盖移动目标。", "error");
    }
  });
  requestAnimationFrame(draw);
}

appendIcon(refresh, RefreshCw);
appendIcon(audioButton, Volume2);
appendIcon(accessibleButton, Accessibility);
initGrid();
initAudioSequence();
initSemanticPick();
initHumanCheck();
initRotateAlign();
initTurnstile();
initHandMotion();
initSpeechWave();
initPatternMemory();
initCountFlash();
initMarketTrade();
initKeyPointer();
initMotion();
reportHeight();

input?.addEventListener("input", () => {
  setStatus("");
});

if (form) {
  new ResizeObserver(reportHeight).observe(form);
}
window.addEventListener("load", reportHeight);

refresh?.addEventListener("click", () => {
  play("click");
  window.location.reload();
});

audioButton?.addEventListener("click", () => {
  play("click");
  if (!player || !shell || !status) {
    return;
  }
  player.src = `/v1/challenges/${shell.dataset.challengeId}/audio.wav`;
  setStatus("正在播放听觉验证码…");
  void player.play().catch(() => {
    setStatus("无法播放音频，请检查设备设置。", "error");
  });
});

accessibleButton?.addEventListener("click", () => {
  play("click");
  reloadWithAccessible();
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!shell?.dataset.challengeId || !submit) {
    return;
  }

  const payload: Record<string, unknown> = {};
  if (
    type === "inverse_occlusion" ||
    type === "calculation" ||
    type === "count_flash"
  ) {
    const answer = input?.value.trim() ?? "";
    if (!answer) {
      setStatus(
        type === "calculation"
          ? "请输入计算结果。"
          : type === "count_flash"
            ? "请输入看到的圆点数量。"
            : "请输入六位数字。",
        "error",
      );
      input?.focus();
      return;
    }
    payload.answer = answer;
  } else if (type === "grid_select") {
    if (selected.size === 0) {
      setStatus("请选择至少一个图标。", "error");
      return;
    }
    payload.selectedIndices = [...selected];
  } else if (type === "pattern_memory") {
    if (patternSelection.length === 0) {
      setStatus("请先播放并重复闪烁序列。", "error");
      return;
    }
    payload.selectedIndices = [...patternSelection];
  } else if (type === "audio_sequence") {
    if (!audioChoice) {
      setStatus("请选择听到的动物。", "error");
      return;
    }
    payload.answer = audioChoice;
  } else if (type === "key_pointer") {
    if (!keyPointerReady || !keyPointerEvidence) {
      setStatus("请先完成键盘与拖动双输入。", "error");
      return;
    }
    payload.holdMs = keyPointerEvidence.holdMs;
    payload.distance = keyPointerEvidence.distance;
  } else if (type === "market_trade") {
    if (marketBuyIndex === null || marketSellIndex === null) {
      setStatus("请先选择买入点和卖出点。", "error");
      return;
    }
    payload.market = {
      buyIndex: marketBuyIndex,
      sellIndex: marketSellIndex,
    };
  } else if (type === "human_check") {
    if (!humanInput?.checked) {
      setStatus("请先勾选确认框。", "error");
      return;
    }
    payload.answer = "human";
    payload.dwellMs = Math.round(performance.now() - pageStartedAt);
  } else if (type === "rotate_align") {
    payload.angle = rotateAngle;
  } else if (type === "semantic_pick") {
    if (!semanticChoice) {
      setStatus("请选择一个答案。", "error");
      return;
    }
    payload.answer = semanticChoice;
  } else if (type === "turnstile") {
    if (!turnstileToken) {
      setStatus("请先完成 Cloudflare 验证。", "error");
      return;
    }
    payload.turnstileToken = turnstileToken;
  } else if (type === "hand_motion") {
    if (handEvidence.length === 0) {
      setStatus("请先完成动态手势。", "error");
      return;
    }
    payload.handGestures = handEvidence;
  } else if (type === "speech_wave") {
    if (audioTakes.length === 0) {
      setStatus("请先完成三遍朗读。", "error");
      return;
    }
    payload.audioTakes = audioTakes;
  } else {
    if (!motionReady || !motionPoint) {
      setStatus("请先持续覆盖移动目标。", "error");
      return;
    }
    payload.point = motionPoint;
  }

  submit.disabled = true;
  setStatus("正在验证…");
  try {
    const response = await fetch(`/v1/challenges/${shell.dataset.challengeId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as {
      verified?: boolean;
      token?: string;
      code?: string;
      remainingAttempts?: number;
      stepPassed?: boolean;
      step?: number;
      totalSteps?: number;
      nextEmbedUrl?: string;
    };

    if (result.verified && result.token) {
      verified = true;
      play("success");
      setStatus("验证成功。", "success");
      post("verified", {
        token: result.token,
        siteKey: shell.dataset.siteKey,
        action: shell.dataset.action,
      });
      submit.textContent = "已完成";
      submit.disabled = true;
      return;
    }

    if (result.stepPassed && result.nextEmbedUrl) {
      transitioning = true;
      play("success");
      setStatus(
        `第 ${result.step ?? 1} / ${result.totalSteps ?? 1} 题通过，正在继续…`,
        "success",
      );
      post("step", {
        step: result.step,
        totalSteps: result.totalSteps,
      });
      await wait(450);
      window.location.replace(result.nextEmbedUrl);
      return;
    }

    play("error");
    if (typeof result.remainingAttempts === "number" && result.remainingAttempts > 0) {
      setStatus(`验证失败，还可尝试 ${result.remainingAttempts} 次。`, "error");
    } else {
      setStatus("验证失败，请刷新后重试。", "error");
    }
    if (type === "inverse_occlusion" && input) {
      input.value = "";
      input.focus();
    }
    post("failed", { code: result.code ?? "INVALID_ANSWER" });
  } catch {
    play("error");
    setStatus("网络错误，请稍后重试。", "error");
    post("error", { code: "NETWORK_ERROR" });
  } finally {
    if (!verified && !transitioning) {
      submit.disabled = false;
    }
  }
});
