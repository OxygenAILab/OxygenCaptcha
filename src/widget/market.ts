import { marketCapital, marketPrices } from "../microgames.js";

export type MarketTrade = {
  buyIndex: number;
  sellIndex: number;
};

export type MarketController = {
  trades: () => MarketTrade[];
  capital: () => number;
  destroy: () => void;
};

type MarketOptions = {
  canvas: HTMLCanvasElement;
  buyButton: HTMLButtonElement | null;
  sellButton: HTMLButtonElement | null;
  help: HTMLElement | null;
  submit: HTMLButtonElement;
  setStatus: (message: string, tone?: "neutral" | "error" | "success") => void;
  play: (effect: "click" | "success" | "error") => void;
  testMode: boolean;
};

export function initMarketChallenge(options: MarketOptions): MarketController {
  const {
    canvas,
    buyButton,
    sellButton,
    help,
    submit,
    setStatus,
    play,
    testMode,
  } = options;
  const context = canvas.getContext("2d");
  if (!context) {
    return { trades: () => [], capital: () => 0, destroy: () => undefined };
  }

  const seed = Number.parseInt(canvas.dataset.seed ?? "1", 10);
  const prices = marketPrices(seed);
  const mode = canvas.dataset.mode === "target" ? "target" : "single";
  const sampleMs = Math.max(
    160,
    Number.parseInt(canvas.dataset.sampleMs ?? "250", 10),
  );
  const durationMs = Math.max(
    sampleMs,
    Number.parseInt(canvas.dataset.duration ?? "15000", 10),
  );
  const initialCapital = Number.parseFloat(
    canvas.dataset.initialCapital ?? "1000",
  );
  const targetCapital = Number.parseFloat(
    canvas.dataset.targetCapital ?? "0",
  );
  const padding = 18;
  const plotWidth = canvas.width - padding * 2;
  const plotHeight = canvas.height - padding * 2;
  const step = plotWidth / Math.max(1, prices.length - 1);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const span = Math.max(0.01, high - low);
  const startedAt = performance.now();
  let visibleTo = 0;
  let frame = 0;
  let running = true;
  let completed = false;
  let buyingIndex: number | null = null;
  let tradeMode: "buy" | "sell" = "buy";
  let trades: MarketTrade[] = [];
  let capitalValue = initialCapital;

  const priceY = (price: number) =>
    padding + (1 - (price - low) / span) * plotHeight;
  const priceX = (index: number) =>
    canvas.width - padding - (visibleTo - index) * step;
  const firstVisibleIndex = () =>
    Math.max(0, visibleTo - Math.floor(plotWidth / step));

  const setMode = (next: "buy" | "sell") => {
    tradeMode = next;
    buyButton?.classList.toggle("is-active", next === "buy");
    sellButton?.classList.toggle("is-active", next === "sell");
    buyButton?.setAttribute("aria-pressed", String(next === "buy"));
    sellButton?.setAttribute("aria-pressed", String(next === "sell"));
    if (buyButton) {
      buyButton.disabled = completed;
    }
    if (sellButton) {
      sellButton.disabled = completed || buyingIndex === null;
    }
  };

  const updateSummary = () => {
    const capital = document.querySelector<HTMLElement>("#oc-market-capital");
    if (!capital) {
      return;
    }
    capital.textContent = capitalValue.toFixed(2);
    capital.classList.toggle("is-target", capitalValue >= targetCapital);
  };

  const draw = () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    const background = context.createLinearGradient(0, 0, 0, canvas.height);
    background.addColorStop(0, "#fbfcfe");
    background.addColorStop(1, "#f0f4f9");
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = "rgba(23, 32, 51, .075)";
    context.lineWidth = 1;
    for (let line = 1; line < 4; line += 1) {
      const y = padding + (plotHeight * line) / 4;
      context.beginPath();
      context.moveTo(padding, y);
      context.lineTo(canvas.width - padding, y);
      context.stroke();
    }

    const firstVisible = firstVisibleIndex();
    const points: Array<{ x: number; y: number }> = [];
    for (let index = firstVisible; index <= visibleTo; index += 1) {
      points.push({
        x: priceX(index),
        y: priceY(prices[index] ?? low),
      });
    }

    const first = points[0];
    const last = points[points.length - 1];
    if (first && last) {
      const fill = context.createLinearGradient(0, padding, 0, canvas.height);
      fill.addColorStop(0, "rgba(35, 100, 232, .18)");
      fill.addColorStop(1, "rgba(35, 100, 232, .015)");
      context.beginPath();
      context.moveTo(first.x, canvas.height - padding);
      for (const point of points) {
        context.lineTo(point.x, point.y);
      }
      context.lineTo(last.x, canvas.height - padding);
      context.closePath();
      context.fillStyle = fill;
      context.fill();

      context.beginPath();
      points.forEach((point, index) => {
        if (index === 0) {
          context.moveTo(point.x, point.y);
        } else {
          context.lineTo(point.x, point.y);
        }
      });
      context.strokeStyle = "#2364e8";
      context.lineWidth = 2.4;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.stroke();

      const latest = prices[visibleTo];
      if (latest !== undefined) {
        const latestY = priceY(latest);
        context.beginPath();
        context.arc(canvas.width - padding, latestY, 8, 0, Math.PI * 2);
        context.fillStyle = "rgba(35, 100, 232, .14)";
        context.fill();
        context.beginPath();
        context.arc(canvas.width - padding, latestY, 4.5, 0, Math.PI * 2);
        context.fillStyle = "#2364e8";
        context.fill();
      }
    }

    const drawMarker = (index: number, label: string, color: string) => {
      if (index < firstVisible || index > visibleTo) {
        return;
      }
      const x = priceX(index);
      const y = priceY(prices[index] ?? low);
      context.fillStyle = color;
      context.beginPath();
      context.arc(x, y, 8, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#ffffff";
      context.font = "700 9px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label, x, y + 0.5);
    };

    trades.forEach((trade, index) => {
      drawMarker(trade.buyIndex, `B${index + 1}`, "#0f7b43");
      drawMarker(trade.sellIndex, `S${index + 1}`, "#b42318");
    });
    if (buyingIndex !== null) {
      drawMarker(
        buyingIndex,
        mode === "target" ? `B${trades.length + 1}` : "B",
        "#0f7b43",
      );
    }

    if (testMode) {
      canvas.dataset.visibleFrom = String(firstVisible);
      canvas.dataset.visibleTo = String(visibleTo);
      canvas.dataset.padding = String(padding);
      canvas.dataset.step = String(step);
      canvas.dataset.canvasWidth = String(canvas.width);
    }
  };

  const finishAnimation = () => {
    running = false;
    submit.disabled =
      mode === "target" ? capitalValue < targetCapital : trades.length === 0;
    if (help) {
      help.textContent =
        mode === "target" && capitalValue < targetCapital
          ? "走势已完整显示，继续选择交易区间。"
          : "走势已完整显示，可以验证当前交易。";
    }
  };

  const animate = (now: number) => {
    if (!running) {
      return;
    }
    const elapsed = now - startedAt;
    visibleTo = Math.min(
      prices.length - 1,
      Math.floor(elapsed / sampleMs),
    );
    draw();
    if (elapsed >= durationMs || visibleTo >= prices.length - 1) {
      finishAnimation();
      return;
    }
    frame = requestAnimationFrame(animate);
  };

  const visibleIndexAt = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / Math.max(1, rect.width);
    const canvasX = Math.max(
      0,
      Math.min(canvas.width, (event.clientX - rect.left) * scale),
    );
    const index = Math.round(
      visibleTo - (canvas.width - padding - canvasX) / step,
    );
    return Math.max(
      firstVisibleIndex(),
      Math.min(visibleTo, index),
    );
  };

  const recordTrade = (sellIndex: number) => {
    if (buyingIndex === null || sellIndex <= buyingIndex) {
      setStatus("卖出点必须晚于买入点。", "error");
      return;
    }
    trades = [...trades, { buyIndex: buyingIndex, sellIndex }];
    capitalValue = marketCapital(prices, trades, initialCapital);
    updateSummary();
    buyingIndex = null;
    setMode("buy");
    if (mode === "single" || capitalValue >= targetCapital) {
      completed = true;
      running = false;
      submit.disabled = false;
      if (help) {
        help.textContent =
          mode === "target"
            ? "目标已达成，点击验证。"
            : "交易已记录，点击验证。";
      }
      setStatus(
        mode === "target" ? "目标已达成，可以验证。" : "交易已记录。",
        "success",
      );
    } else {
      submit.disabled = true;
      if (help) {
        help.textContent = "继续选择下一次买入和卖出。";
      }
      setStatus(
        `当前资产 ${capitalValue.toFixed(2)}，继续交易。`,
        "success",
      );
    }
    draw();
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || completed) {
      return;
    }
    const index = visibleIndexAt(event);
    if (tradeMode === "buy") {
      buyingIndex = index;
      setMode("sell");
      if (help) {
        help.textContent = "买入点已记录，请继续选择卖出点。";
      }
      setStatus("买入点已记录。");
    } else if (buyingIndex !== null) {
      recordTrade(index);
    }
    play("click");
    draw();
  });

  buyButton?.addEventListener("click", () => {
    if (completed) {
      return;
    }
    buyingIndex = null;
    submit.disabled = true;
    setMode("buy");
    if (help) {
      help.textContent = "请选择新的买入点。";
    }
    draw();
  });
  sellButton?.addEventListener("click", () => {
    if (completed) {
      return;
    }
    if (buyingIndex === null) {
      setStatus("请先选择买入点。", "error");
      return;
    }
    setMode("sell");
    if (help) {
      help.textContent = "请选择卖出点。";
    }
    draw();
  });

  updateSummary();
  setMode("buy");
  draw();
  frame = requestAnimationFrame(animate);

  return {
    trades: () => [...trades],
    capital: () => capitalValue,
    destroy: () => {
      running = false;
      if (frame) {
        cancelAnimationFrame(frame);
      }
    },
  };
}
