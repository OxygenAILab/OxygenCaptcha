import {
  Accessibility,
  Bird,
  Cat,
  Check,
  createElement,
  Dog,
  Play,
  RefreshCw,
  Volume2,
} from "lucide";
import { zzfx } from "zzfx";

type MotionData = {
  width: number;
  height: number;
  seed: number;
  duration: number;
};

type MotionPoint = { x: number; y: number; elapsedMs: number };

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
const gestureWrap = document.querySelector<HTMLElement>(".oc-gesture-wrap");
const motionWrap = document.querySelector<HTMLElement>(".oc-motion-wrap");
const motionCanvas = document.querySelector<HTMLCanvasElement>("#oc-motion-canvas");
const motionHelp = document.querySelector<HTMLElement>("#oc-motion-help");
const type = body.dataset.challengeType ?? "inverse_occlusion";
const selected = new Set<number>();
let audioChoice: string | null = null;
let keyPointerEvidence: { holdMs: number; distance: number } | null = null;
let keyPointerReady = false;
let verified = false;
let motionPoint: MotionPoint | null = null;
let motionReady = false;
let lastReportedHeight = 0;

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
  if (type === "inverse_occlusion" || type === "calculation") {
    const answer = input?.value.trim() ?? "";
    if (!answer) {
      setStatus(type === "calculation" ? "请输入计算结果。" : "请输入六位数字。", "error");
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
    if (!verified) {
      submit.disabled = false;
    }
  }
});
