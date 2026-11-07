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
  thumb_up: "竖起大拇指",
  thumb_down: "倒竖大拇指",
  point_up: "食指上指",
  ok: "OK 手势",
  call_me: "打电话手势",
  l_sign: "L 形手势",
  pinky: "小指伸出",
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
  const thumbTip = landmarks[4];
  const thumbIp = landmarks[3];
  const indexTip = landmarks[8];
  const thumbExtended = Boolean(
    thumbTip &&
      thumbIp &&
      distance(thumbTip, wrist) > distance(thumbIp, wrist) * 1.04,
  );
  const thumbUp = Boolean(thumbTip && thumbTip.y < wrist.y - 0.07);
  const thumbDown = Boolean(thumbTip && thumbTip.y > wrist.y + 0.07);
  const indexUp = Boolean(indexTip && indexTip.y < (landmarks[6]?.y ?? indexTip.y));
  const okRing = Boolean(
    thumbTip && indexTip && distance(thumbTip, indexTip) < 0.09,
  );
  const extended = [index, middle, ring, pinky].filter(Boolean).length;

  if (okRing && middle && ring && pinky) {
    return "ok";
  }
  if (thumbExtended && pinky && !index && !middle && !ring) {
    return "call_me";
  }
  if (
    thumbExtended &&
    index &&
    !middle &&
    !ring &&
    !pinky
  ) {
    const thumbVector = {
      x: (thumbTip?.x ?? 0) - wrist.x,
      y: (thumbTip?.y ?? 0) - wrist.y,
    };
    const indexVector = {
      x: (indexTip?.x ?? 0) - wrist.x,
      y: (indexTip?.y ?? 0) - wrist.y,
    };
    const cosine =
      (thumbVector.x * indexVector.x + thumbVector.y * indexVector.y) /
      Math.max(
        0.001,
        Math.hypot(thumbVector.x, thumbVector.y) * Math.hypot(indexVector.x, indexVector.y),
      );
    return cosine < 0.72 ? "l_sign" : "point_up";
  }
  if (thumbExtended && !index && !middle && !ring && !pinky) {
    if (thumbUp) {
      return "thumb_up";
    }
    if (thumbDown) {
      return "thumb_down";
    }
  }
  if (index && !middle && !ring && !pinky) {
    return indexUp ? "point_up" : "unknown";
  }
  if (pinky && !index && !middle && !ring) {
    return "pinky";
  }
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
