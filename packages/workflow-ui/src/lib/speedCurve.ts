/**
 * Speed Curve Utility
 *
 * Advanced time-warping for video speed ramps using easing functions.
 * Maps original video timestamps to warped timestamps through easing curves.
 */

import { type EasingFunction, easing, getEasingFunction } from './easing';

const INVERSE_TOLERANCE = 1e-6;
const INVERSE_MAX_ITERATIONS = 32;
const MONOTONICITY_SAMPLES = 256;
const MONOTONICITY_TOLERANCE = 1e-6;

const inverseCache = new WeakMap<EasingFunction, EasingFunction | null>();
const monotonicityCache = new WeakMap<EasingFunction, boolean>();

function isMonotonicIncreasing(func: EasingFunction): boolean {
  const cached = monotonicityCache.get(func);
  if (cached !== undefined) {
    return cached;
  }

  let prev = func(0);
  for (let i = 1; i <= MONOTONICITY_SAMPLES; i++) {
    const value = func(i / MONOTONICITY_SAMPLES);
    if (value + MONOTONICITY_TOLERANCE < prev) {
      monotonicityCache.set(func, false);
      return false;
    }
    prev = value;
  }

  monotonicityCache.set(func, true);
  return true;
}

function invertEasingValue(target: number, func: EasingFunction): number {
  if (target <= INVERSE_TOLERANCE) {
    return 0;
  }
  if (target >= 1 - INVERSE_TOLERANCE) {
    return 1;
  }

  let low = 0;
  let high = 1;
  let mid = 0.5;

  for (let i = 0; i < INVERSE_MAX_ITERATIONS; i++) {
    mid = (low + high) / 2;
    const value = func(mid);
    const diff = value - target;

    if (Math.abs(diff) <= INVERSE_TOLERANCE) {
      break;
    }

    if (diff < 0) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return Math.min(1, Math.max(0, mid));
}

function getInverseEasing(func: EasingFunction): EasingFunction | null {
  if (inverseCache.has(func)) {
    return inverseCache.get(func)!;
  }

  if (!isMonotonicIncreasing(func)) {
    inverseCache.set(func, null);
    return null;
  }

  const inverse: EasingFunction = (value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    return invertEasingValue(clamped, func);
  };

  inverseCache.set(func, inverse);
  return inverse;
}

function mapTimeWithEasing(
  normalizedTime: number,
  func: EasingFunction,
): number {
  const inverse = getInverseEasing(func);
  if (!inverse) {
    // Non-monotonic function — fall back to direct mapping
    return func(normalizedTime);
  }

  return inverse(normalizedTime);
}

/**
 * Maps original video timestamps to warped timestamps using any easing function.
 *
 * @param originalTime - Original timestamp in seconds (0 to inputDuration)
 * @param inputDuration - Input video duration in seconds (default: 5)
 * @param outputDuration - Output video duration in seconds (default: 1.5)
 * @param easingFunction - Easing function or function name string (default: easeInOutCubic)
 * @returns Warped timestamp for the output video
 */
export function warpTime(
  originalTime: number,
  inputDuration: number = 5,
  outputDuration: number = 1.5,
  easingFunction: EasingFunction | string = easing.easeInOutCubic,
): number {
  const easingFunc =
    typeof easingFunction === 'string'
      ? getEasingFunction(easingFunction)
      : easingFunction;

  const t = originalTime / inputDuration;
  const clamped = Math.max(0, Math.min(1, t));
  const eased = mapTimeWithEasing(clamped, easingFunc);

  return eased * outputDuration;
}

/**
 * Calculate the duration of a frame after warping.
 */
export function calculateWarpedDuration(
  originalStart: number,
  originalDuration: number,
  inputDuration: number = 5,
  outputDuration: number = 1.5,
  easingFunction: EasingFunction | string = easing.easeInOutCubic,
): number {
  const warpedStart = warpTime(
    originalStart,
    inputDuration,
    outputDuration,
    easingFunction,
  );
  const warpedEnd = warpTime(
    originalStart + originalDuration,
    inputDuration,
    outputDuration,
    easingFunction,
  );
  return warpedEnd - warpedStart;
}

/**
 * Validate that a warp time function produces valid output.
 */
export function validateWarpFunction(
  easingFunction: EasingFunction | string = easing.easeInOutCubic,
  inputDuration: number = 5,
  outputDuration: number = 1.5,
  tolerance: number = 0.001,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const startWarp = warpTime(0, inputDuration, outputDuration, easingFunction);
  if (Math.abs(startWarp - 0) > tolerance) {
    errors.push(`Start point should be 0, got ${startWarp}`);
  }

  const endWarp = warpTime(
    inputDuration,
    inputDuration,
    outputDuration,
    easingFunction,
  );
  if (Math.abs(endWarp - outputDuration) > tolerance) {
    errors.push(`End point should be ${outputDuration}, got ${endWarp}`);
  }

  let prevWarp = 0;
  for (let t = 0; t <= inputDuration; t += inputDuration / 100) {
    const warp = warpTime(t, inputDuration, outputDuration, easingFunction);
    if (warp < prevWarp) {
      errors.push(
        `Monotonicity violation at t=${t.toFixed(2)}: ${warp} < ${prevWarp}`,
      );
      break;
    }
    prevWarp = warp;
  }

  return { errors, valid: errors.length === 0 };
}

/**
 * Generate statistics about the warp curve.
 */
export function analyzeWarpCurve(
  easingFunction: EasingFunction | string = easing.easeInOutCubic,
  inputDuration: number = 5,
  outputDuration: number = 1.5,
  samples: number = 100,
): {
  speedMultipliers: number[];
  minSpeed: number;
  maxSpeed: number;
  avgSpeed: number;
} {
  const speedMultipliers: number[] = [];
  const averageSpeed = inputDuration / outputDuration;

  for (let i = 0; i < samples; i++) {
    const t1 = (i / samples) * inputDuration;
    const t2 = ((i + 1) / samples) * inputDuration;

    const warp1 = warpTime(t1, inputDuration, outputDuration, easingFunction);
    const warp2 = warpTime(t2, inputDuration, outputDuration, easingFunction);

    const inputSegmentDuration = t2 - t1;
    const outputSegmentDuration = warp2 - warp1;
    const absoluteSpeed =
      inputSegmentDuration / (outputSegmentDuration + 1e-10);
    const speedMultiplier = absoluteSpeed / averageSpeed;

    speedMultipliers.push(speedMultiplier);
  }

  const minSpeed = Math.min(...speedMultipliers);
  const maxSpeed = Math.max(...speedMultipliers);
  const avgSpeed =
    speedMultipliers.reduce((a, b) => a + b, 0) / speedMultipliers.length;

  return { avgSpeed, maxSpeed, minSpeed, speedMultipliers };
}
