import { randomInt } from "node:crypto";
import type { MotionState } from "./types.js";

export function createMotion(seed = randomInt(1, 2_147_483_647)): MotionState {
  return {
    seed,
    width: 360,
    height: 150,
    durationMs: 20_000,
    requiredCoverageMs: 1_800,
    targetRadius: 32,
  };
}

export function motionTarget(motion: MotionState, elapsedMs: number): { x: number; y: number } {
  const time = Math.max(0, Math.min(motion.durationMs, elapsedMs));
  const phase = (motion.seed % 360) * (Math.PI / 180);
  const t = time / motion.durationMs;
  const x =
    motion.width *
    (0.5 + 0.34 * Math.sin(t * Math.PI * 2 + phase));
  const y =
    motion.height *
    (0.5 + 0.25 * Math.sin(t * Math.PI * 4 + phase * 0.5));
  return { x, y };
}

export function validMotionPoint(
  motion: MotionState,
  point: { x: number; y: number; elapsedMs: number },
  coverageMs = 0,
): boolean {
  if (
    point.elapsedMs < 4_000 ||
    point.elapsedMs > motion.durationMs ||
    coverageMs < motion.requiredCoverageMs
  ) {
    return false;
  }
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return false;
  }
  const target = motionTarget(motion, point.elapsedMs);
  const distance = Math.hypot(point.x - target.x, point.y - target.y);
  return distance <= motion.targetRadius;
}
