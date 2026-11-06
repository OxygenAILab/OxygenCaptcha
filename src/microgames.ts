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
  return 5 + (seed % 8);
}

export function countFlashPoints(
  seed: number,
  count: number,
): Array<{ x: number; y: number; radius: number }> {
  const random = seededRandom(seed ^ 0x9e37_79b9);
  return Array.from({ length: count }, () => ({
    x: 0.12 + random() * 0.76,
    y: 0.12 + random() * 0.76,
    radius: 9 + random() * 6,
  }));
}

export function marketPrices(seed: number, count = 121): number[] {
  const phase = ((seed % 1_000) / 1_000) * Math.PI * 2;
  return Array.from({ length: count }, (_, index) => {
    const t = index / Math.max(1, count - 1);
    const trend = 0.5 + 0.28 * Math.sin(Math.PI * 2 * (t - 0.45) + phase * 0.08);
    const wave = 0.024 * Math.sin(index * 1.73 + phase);
    const micro = 0.012 * Math.sin(index * 0.47 + phase * 2.3);
    return Math.max(0.04, Math.min(0.96, trend + wave + micro));
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

export function createMarketTrade(seed: number): MarketTradeState {
  const width = 360;
  const height = 156;
  const prices = marketPrices(seed);
  const extremes = extremeIndices(prices);
  return {
    seed,
    width,
    height,
    prices,
    buyIndex: extremes.low,
    sellIndex: extremes.high,
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

export function validMarketChoice(
  market: MarketTradeState,
  buyIndex: number | undefined,
  sellIndex: number | undefined,
): boolean {
  if (
    buyIndex === undefined ||
    sellIndex === undefined ||
    buyIndex < 0 ||
    sellIndex < 0 ||
    buyIndex >= market.prices.length ||
    sellIndex >= market.prices.length ||
    buyIndex >= sellIndex
  ) {
    return false;
  }
  return Math.abs(buyIndex - market.buyIndex) <= 3 && Math.abs(sellIndex - market.sellIndex) <= 3;
}
