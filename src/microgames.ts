import type {
  CountFlashState,
  MarketTradeState,
  PatternMemoryState,
} from "./types.js";

export const PATTERN_ICON_KEYS = ["star", "heart", "moon", "sun"] as const;

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}

export function patternSequence(seed: number, length: number): number[] {
  const random = seededRandom(seed);
  return Array.from({ length }, () => Math.floor(random() * PATTERN_ICON_KEYS.length));
}

export function countFromSeed(seed: number): number {
  return 3 + (seed % 3);
}

export function countFlashPoints(
  seed: number,
  count: number,
): Array<{ x: number; y: number; radius: number }> {
  const random = seededRandom(seed ^ 0x9e37_79b9);
  const canvas = { width: 360, height: 170 };
  const radius = 11;
  const targetCount = Math.min(5, Math.max(1, count));
  const slots = [
    { x: 70, y: 54, spreadX: 24, spreadY: 18 },
    { x: 180, y: 54, spreadX: 24, spreadY: 18 },
    { x: 290, y: 54, spreadX: 24, spreadY: 18 },
    { x: 125, y: 124, spreadX: 24, spreadY: 16 },
    { x: 235, y: 124, spreadX: 24, spreadY: 16 },
  ];
  for (let index = slots.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = slots[index];
    const other = slots[swapIndex];
    if (current && other) {
      slots[index] = other;
      slots[swapIndex] = current;
    }
  }
  return slots.slice(0, targetCount).map((slot) => ({
    x:
      (slot.x + (random() * 2 - 1) * slot.spreadX) /
      canvas.width,
    y:
      (slot.y + (random() * 2 - 1) * slot.spreadY) /
      canvas.height,
    radius,
  }));
}

export function marketPrices(seed: number, count = 60): number[] {
  const random = seededRandom(seed ^ 0x5bd1_e995);
  const phase = ((seed % 997) / 997) * Math.PI * 2;
  const cycles = 2 + (seed % 2);
  let noise = 0;
  return Array.from({ length: count }, (_, index) => {
    const t = index / Math.max(1, count - 1);
    noise = noise * 0.86 + (random() - 0.5) * 0.9;
    const wave =
      4.6 * Math.sin(Math.PI * 2 * (cycles * t + phase)) +
      1.35 * Math.sin(Math.PI * 2 * (6.2 * t + phase * 0.7));
    const price = 100 + wave + noise;
    return Math.round(Math.max(78, Math.min(122, price)) * 100) / 100;
  });
}

export function extremeIndices(prices: number[]): { low: number; high: number } {
  let low = 0;
  let high = 0;
  for (let index = 1; index < prices.length; index += 1) {
    if ((prices[index] ?? 0) < (prices[low] ?? 0)) {
      low = index;
    }
    if ((prices[index] ?? 0) > (prices[high] ?? 0)) {
      high = index;
    }
  }
  return { low, high };
}

export function createPatternMemory(sequenceLength: number, seed: number): PatternMemoryState {
  return { seed, sequenceLength };
}

export function createCountFlash(seed: number): CountFlashState {
  return {
    seed,
    count: countFromSeed(seed),
    revealMs: 900,
  };
}

export function marketBand(
  prices: number[],
  ratio: number,
): { low: number; high: number; min: number; max: number } {
  const sorted = [...prices].sort((left, right) => left - right);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? min;
  const span = Math.max(0.01, max - min);
  const lowIndex = Math.max(0, Math.floor(sorted.length * ratio) - 1);
  const highIndex = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * (1 - ratio)),
  );
  return {
    low: sorted[lowIndex] ?? min,
    high: sorted[highIndex] ?? max,
    min,
    max: min + span,
  };
}

export function createMarketTrade(
  seed: number,
  mode: MarketTradeState["mode"] = "single",
): MarketTradeState {
  const width = 360;
  const height = 156;
  const profitPct = 5 + (seed % 11);
  const initialCapital = 1_000;
  const targetCapital = initialCapital * (1 + profitPct / 100);
  let chosenSeed = seed;
  let prices = marketPrices(chosenSeed);
  if (mode === "target") {
    for (
      let attempt = 0;
      attempt < 24 &&
      achievableMarketCapital(prices, 0.16, 0.16, initialCapital) <
        targetCapital;
      attempt += 1
    ) {
      chosenSeed = seed + (attempt + 1) * 104_729;
      prices = marketPrices(chosenSeed);
    }
  }
  return {
    seed: chosenSeed,
    width,
    height,
    prices,
    mode,
    sampleMs: 250,
    durationMs: 15_000,
    buyBandRatio: 0.16,
    sellBandRatio: 0.16,
    ...(mode === "target"
      ? {
          initialCapital,
          targetCapital,
        }
      : {}),
  };
}

export function validPatternSelection(
  selected: number[] | undefined,
  sequence: number[],
): boolean {
  return Boolean(
    selected &&
      selected.length === sequence.length &&
      selected.every((value, index) => value === sequence[index]),
  );
}

export function marketCapital(
  prices: number[],
  trades: Array<{ buyIndex: number; sellIndex: number }>,
  initialCapital: number,
): number {
  return trades.reduce((capital, trade) => {
    const buy = prices[trade.buyIndex];
    const sell = prices[trade.sellIndex];
    if (buy === undefined || sell === undefined || buy <= 0) {
      return capital;
    }
    return capital * (sell / buy);
  }, initialCapital);
}

export function achievableMarketCapital(
  prices: number[],
  buyBandRatio: number,
  sellBandRatio: number,
  initialCapital: number,
): number {
  const buyBand = marketBand(prices, buyBandRatio);
  const sellBand = marketBand(prices, sellBandRatio);
  const trades: Array<{ buyIndex: number; sellIndex: number }> = [];
  let previousSell = -1;
  for (let buyIndex = 0; buyIndex < prices.length; buyIndex += 1) {
    const buy = prices[buyIndex];
    if (buyIndex <= previousSell || buy === undefined || buy > buyBand.low) {
      continue;
    }
    for (let sellIndex = buyIndex + 1; sellIndex < prices.length; sellIndex += 1) {
      const sell = prices[sellIndex];
      if (sell !== undefined && sell >= sellBand.high) {
        trades.push({ buyIndex, sellIndex });
        previousSell = sellIndex;
        break;
      }
    }
  }
  return marketCapital(prices, trades, initialCapital);
}

export function validMarketChoice(
  market: MarketTradeState,
  trades: Array<{ buyIndex: number; sellIndex: number }> | undefined,
): boolean {
  if (!trades || trades.length === 0) {
    return false;
  }
  let previousSell = -1;
  for (const trade of trades) {
    const { buyIndex, sellIndex } = trade;
    if (
      buyIndex < 0 ||
      sellIndex < 0 ||
      buyIndex >= market.prices.length ||
      sellIndex >= market.prices.length ||
      buyIndex >= sellIndex ||
      buyIndex <= previousSell
    ) {
      return false;
    }
    previousSell = sellIndex;
  }

  const buyBand = marketBand(market.prices, market.buyBandRatio);
  const sellBand = marketBand(market.prices, market.sellBandRatio);
  if (market.mode === "single") {
    const trade = trades[0];
    if (!trade) {
      return false;
    }
    const buy = market.prices[trade.buyIndex] ?? Number.POSITIVE_INFINITY;
    const sell = market.prices[trade.sellIndex] ?? Number.NEGATIVE_INFINITY;
    return trades.length === 1 && buy <= buyBand.low && sell >= sellBand.high;
  }

  const initial = market.initialCapital ?? 1_000;
  for (const trade of trades) {
    const buy = market.prices[trade.buyIndex] ?? Number.POSITIVE_INFINITY;
    const sell = market.prices[trade.sellIndex] ?? Number.NEGATIVE_INFINITY;
    if (buy > buyBand.low || sell < sellBand.high) {
      return false;
    }
  }
  return marketCapital(market.prices, trades, initial) >= (market.targetCapital ?? initial);
}
