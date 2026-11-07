import type { SpeechWaveState } from "./types.js";

export type SpeechTemplate = {
  phrase: string;
  targetWords: string[];
};

export const SPEECH_TEMPLATES: SpeechTemplate[] = [
  {
    phrase: "I like apples, apples are good for our health.",
    targetWords: ["apples"],
  },
  {
    phrase:
      "宋钢在门外咯咯地笑了起来，李光头听到了宋钢的笑声后，也破涕为笑了。李光头哭一声笑一声，又笑一声哭一声。后来两个孩子靠着门板坐在了地上，隔着门板背靠背说了很多话。",
    targetWords: ["李光头", "宋钢", "笑", "哭", "一声", "门板"],
  },
];

export function createSpeechWave(template: SpeechTemplate): SpeechWaveState {
  const focusWindows = template.targetWords
    .filter((targetWord) => targetWord.length > 0)
    .map((targetWord) => {
      const index = template.phrase.indexOf(targetWord);
      if (index < 0) {
        return undefined;
      }
      const padding =
        Math.max(1, Math.ceil(targetWord.length * 0.5)) /
        Math.max(1, template.phrase.length);
      return {
        targetWord,
        start: Math.max(0, index / template.phrase.length - padding),
        end: Math.min(
          1,
          (index + targetWord.length) / template.phrase.length + padding,
        ),
      };
    })
    .filter((window): window is NonNullable<typeof window> => Boolean(window));
  const firstWindow = focusWindows[0] ?? {
    targetWord: template.targetWords[0] ?? template.phrase,
    start: 0,
    end: 1,
  };
  return {
    phrase: template.phrase,
    targetWords: template.targetWords,
    focusWindows,
    focusStart: firstWindow.start,
    focusEnd: firstWindow.end,
    takeCount: 3,
  };
}

function clampWindow(frames: number[][], start: number, end: number): number[][] {
  if (frames.length === 0) {
    return [];
  }
  const from = Math.max(0, Math.floor(frames.length * start));
  const to = Math.min(frames.length, Math.max(from + 4, Math.ceil(frames.length * end)));
  return frames.slice(from, to);
}

function normalizeFrames(frames: number[][]): number[][] {
  const dimension = frames[0]?.length ?? 0;
  if (dimension === 0) {
    return frames;
  }
  const means = Array.from({ length: dimension }, (_, index) => {
    return frames.reduce((total, frame) => total + (frame[index] ?? 0), 0) / frames.length;
  });
  const deviations = Array.from({ length: dimension }, (_, index) => {
    const variance =
      frames.reduce((total, frame) => {
        const delta = (frame[index] ?? 0) - (means[index] ?? 0);
        return total + delta * delta;
      }, 0) / frames.length;
    return Math.sqrt(variance) || 1;
  });
  return frames.map((frame) =>
    frame.map(
      (value, index) => (value - (means[index] ?? 0)) / (deviations[index] ?? 1),
    ),
  );
}

function frameDistance(left: number[], right: number[]): number {
  let total = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    total += delta * delta;
  }
  return Math.sqrt(total / Math.max(1, length));
}

function dtwDistance(left: number[][], right: number[][]): number {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const previous = new Float64Array(columns).fill(Number.POSITIVE_INFINITY);
  const current = new Float64Array(columns).fill(Number.POSITIVE_INFINITY);
  previous[0] = 0;
  for (let row = 1; row < rows; row += 1) {
    current.fill(Number.POSITIVE_INFINITY);
    current[0] = 0;
    for (let column = 1; column < columns; column += 1) {
      const cost = frameDistance(left[row - 1] ?? [], right[column - 1] ?? []);
      current[column] = cost + Math.min(
        previous[column] ?? Number.POSITIVE_INFINITY,
        current[column - 1] ?? Number.POSITIVE_INFINITY,
        previous[column - 1] ?? Number.POSITIVE_INFINITY,
      );
    }
    previous.set(current);
  }
  return (previous[columns - 1] ?? Number.POSITIVE_INFINITY) / Math.max(left.length, right.length);
}

export function speechTakesValid(
  state: SpeechWaveState,
  takes: number[][][] | undefined,
): boolean {
  if (!takes || takes.length !== state.takeCount) {
    return false;
  }
  const dimensions = takes[0]?.length ? (takes[0][0]?.length ?? 0) : 0;
  if (dimensions < 5) {
    return false;
  }
  const windows: number[][][] = [];
  for (const take of takes) {
    if (
      take.length < 20 ||
      take.length > 160 ||
      take.some((frame) => frame.length !== dimensions)
    ) {
      return false;
    }
    windows.push(take);
  }

  const focusWindows = state.focusWindows.length > 0
    ? state.focusWindows
    : [{ targetWord: "phrase", start: state.focusStart, end: state.focusEnd }];
  for (const focusWindow of focusWindows) {
    const focused = windows.map((take) => {
      const focus = clampWindow(take, focusWindow.start, focusWindow.end);
      return focus.length >= 4 ? normalizeFrames(focus) : [];
    });
    if (focused.some((frames) => frames.length < 4)) {
      return false;
    }
    const distances = [
      dtwDistance(focused[0] ?? [], focused[1] ?? []),
      dtwDistance(focused[0] ?? [], focused[2] ?? []),
      dtwDistance(focused[1] ?? [], focused[2] ?? []),
    ];
    const minimum = Math.min(...distances);
    const maximum = Math.max(...distances);
    const average = distances.reduce((total, value) => total + value, 0) / distances.length;
    if (!(minimum > 0.018 && average > 0.04 && average < 1.65 && maximum < 2.8)) {
      return false;
    }
  }
  return true;
}
