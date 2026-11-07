import type { HandMotionAction, HandMotionState } from "./types.js";

export type HandLandmark = {
  x: number;
  y: number;
  z: number;
};

export const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

export const HAND_GESTURE_LABELS: Record<HandMotionAction, string> = {
  open: "张开手掌",
  fist: "握拳",
  peace: "剪刀手",
};

function distance(a: HandLandmark, b: HandLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function classifyHand(landmarks: HandLandmark[]): HandMotionAction | "unknown" {
  if (landmarks.length < 21) {
    return "unknown";
  }
  const wrist = landmarks[0];
  if (!wrist) {
    return "unknown";
  }
  const finger = (pip: number, tip: number) => {
    const pipPoint = landmarks[pip];
    const tipPoint = landmarks[tip];
    if (!pipPoint || !tipPoint) {
      return false;
    }
    return distance(tipPoint, wrist) > distance(pipPoint, wrist) * 1.12;
  };
  const index = finger(6, 8);
  const middle = finger(10, 12);
  const ring = finger(14, 16);
  const pinky = finger(18, 20);
  const extended = [index, middle, ring, pinky].filter(Boolean).length;

  if (extended === 4) {
    return "open";
  }
  if (extended === 0) {
    return "fist";
  }
  if (index && middle && !ring && !pinky) {
    return "peace";
  }
  return "unknown";
}

export function validHandMotion(
  state: HandMotionState,
  observations:
    | Array<{
        action: HandMotionAction;
        durationMs: number;
      }>
    | undefined,
): boolean {
  return Boolean(
    observations &&
      observations.length === state.sequence.length &&
      observations.every(
        (observation, index) =>
          observation.action === state.sequence[index] &&
          observation.durationMs >= state.holdMs,
      ),
  );
}
