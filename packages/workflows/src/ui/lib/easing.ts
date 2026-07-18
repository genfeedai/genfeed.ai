import type { CubicBezier, EasingPreset } from '@genfeedai/types';

// =============================================================================
// TYPES
// =============================================================================

export type EasingFunction = (t: number) => number;

// =============================================================================
// CUBIC BEZIER PRESETS (original - typed to EasingPreset union)
// =============================================================================

/**
 * Easing presets based on easy-peasy-ease patterns
 * Each preset is a cubic bezier curve: [x1, y1, x2, y2]
 */
export const EASING_PRESETS: Record<EasingPreset, CubicBezier> = {
  // Standard easing functions
  easeIn: [0.42, 0, 1, 1],

  // Cubic easing
  easeInCubic: [0.55, 0.055, 0.675, 0.19],

  // Exponential easing
  easeInExpo: [0.95, 0.05, 0.795, 0.035],
  easeInOut: [0.42, 0, 0.58, 1],
  easeInOutCubic: [0.645, 0.045, 0.355, 1],
  easeInOutExpo: [1, 0, 0, 1],
  easeInOutQuad: [0.455, 0.03, 0.515, 0.955],

  // Quadratic easing
  easeInQuad: [0.55, 0.085, 0.68, 0.53],
  easeOut: [0, 0, 0.58, 1],
  easeOutCubic: [0.215, 0.61, 0.355, 1],
  easeOutExpo: [0.19, 1, 0.22, 1],
  easeOutQuad: [0.25, 0.46, 0.45, 0.94],
  // Linear - no easing
  linear: [0, 0, 1, 1],
};

// =============================================================================
// EXTENDED BEZIER MAPS (from easing-presets.ts)
// =============================================================================

export const DEFAULT_CUSTOM_BEZIER: CubicBezier = [0.42, 0, 0.58, 1];

/** Named presets for the CubicBezierEditor */
export const PRESET_BEZIERS = {
  easeInExpoOutCubic: [0.85, 0, 0.15, 1],
  easeInOutCubic: [0.65, 0, 0.35, 1],
  easeInOutExpo: [0.87, 0, 0.13, 1],
  easeInOutSine: [0.37, 0, 0.63, 1],
  easeInQuartOutQuad: [0.8, 0, 0.2, 1],
} as const satisfies Record<string, CubicBezier>;

export type EasingPresetName = keyof typeof PRESET_BEZIERS;

/**
 * Full bezier map covering all standard easings from easings.net.
 * Hybrid easings (easeInExpoOutCubic, easeInQuartOutQuad) are approximations
 * since asymmetric compositions can't be exactly represented by a single cubic bezier.
 */
export const EASING_BEZIER_MAP: Record<string, CubicBezier> = {
  ...PRESET_BEZIERS,
  easeInCirc: [0.55, 0, 1, 0.45],
  easeInCubic: [0.32, 0, 0.67, 0],
  easeInExpo: [0.7, 0, 0.84, 0],
  easeInOutCirc: [0.85, 0, 0.15, 1],
  easeInOutQuad: [0.45, 0, 0.55, 1],
  easeInOutQuart: [0.76, 0, 0.24, 1],
  easeInOutQuint: [0.83, 0, 0.17, 1],
  easeInQuad: [0.11, 0, 0.5, 0],
  easeInQuart: [0.5, 0, 0.75, 0],
  easeInQuint: [0.64, 0, 0.78, 0],
  easeInSine: [0.12, 0, 0.39, 0],
  easeOutCirc: [0, 0.55, 0.45, 1],
  easeOutCubic: [0.33, 1, 0.68, 1],
  easeOutExpo: [0.16, 1, 0.3, 1],
  easeOutQuad: [0.5, 1, 0.89, 1],
  easeOutQuart: [0.25, 1, 0.5, 1],
  easeOutQuint: [0.22, 1, 0.36, 1],
  easeOutSine: [0.61, 1, 0.88, 1],
  linear: [0, 0, 1, 1],
};

/** Look up a preset bezier from PRESET_BEZIERS by name */
export function getPresetBezier(preset?: string | null): CubicBezier {
  const handles = preset ? PRESET_BEZIERS[preset as EasingPresetName] : null;
  const source = handles ?? DEFAULT_CUSTOM_BEZIER;
  return [...source] as CubicBezier;
}

/** Look up any easing bezier from the full EASING_BEZIER_MAP */
export function getEasingBezier(name?: string | null): CubicBezier {
  const handles = name ? EASING_BEZIER_MAP[name] : null;
  const source = handles ?? DEFAULT_CUSTOM_BEZIER;
  return [...source] as CubicBezier;
}

// =============================================================================
// PARAMETRIC EASING FUNCTIONS (from easing-functions.ts)
// =============================================================================

export function createAsymmetricEase(
  easeIn: EasingFunction,
  easeOut: EasingFunction,
): EasingFunction {
  return (t: number): number => {
    if (t <= 0.5) {
      return 0.5 * easeIn(t * 2);
    }
    return 0.5 + 0.5 * easeOut((t - 0.5) * 2);
  };
}

const baseEasing = {
  easeInCirc: (t: number): number => 1 - Math.sqrt(1 - t ** 2),
  easeInCubic: (t: number): number => t * t * t,
  easeInExpo: (t: number): number => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  easeInOutCirc: (t: number): number =>
    t < 0.5
      ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2
      : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2,
  easeInOutCubic: (t: number): number =>
    t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
  easeInOutExpo: (t: number): number =>
    t === 0
      ? 0
      : t === 1
        ? 1
        : t < 0.5
          ? 2 ** (20 * t - 10) / 2
          : (2 - 2 ** (-20 * t + 10)) / 2,
  easeInOutQuad: (t: number): number =>
    t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInOutQuart: (t: number): number =>
    t < 0.5 ? 8 * t * t * t * t : 1 - (-2 * t + 2) ** 4 / 2,
  easeInOutQuint: (t: number): number =>
    t < 0.5 ? 16 * t * t * t * t * t : 1 - (-2 * t + 2) ** 5 / 2,
  easeInOutSine: (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInQuad: (t: number): number => t * t,
  easeInQuart: (t: number): number => t * t * t * t,
  easeInQuint: (t: number): number => t * t * t * t * t,
  easeInSine: (t: number): number => 1 - Math.cos((t * Math.PI) / 2),
  easeOutCirc: (t: number): number => Math.sqrt(1 - (t - 1) ** 2),
  easeOutCubic: (t: number): number => {
    const t1 = t - 1;
    return t1 * t1 * t1 + 1;
  },
  easeOutExpo: (t: number): number => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  easeOutQuad: (t: number): number => t * (2 - t),
  easeOutQuart: (t: number): number => {
    const t1 = t - 1;
    return 1 - t1 * t1 * t1 * t1;
  },
  easeOutQuint: (t: number): number => {
    const t1 = t - 1;
    return 1 + t1 * t1 * t1 * t1 * t1;
  },
  easeOutSine: (t: number): number => Math.sin((t * Math.PI) / 2),
  linear: (t: number): number => t,
} as const;

const hybridEasing = {
  easeInExpoOutCubic: createAsymmetricEase(
    baseEasing.easeInExpo,
    baseEasing.easeOutCubic,
  ),
  easeInQuartOutQuad: createAsymmetricEase(
    baseEasing.easeInQuart,
    baseEasing.easeOutQuad,
  ),
} as const;

/** All parametric easing functions (22 base + 2 hybrids) */
export const easing = {
  ...baseEasing,
  ...hybridEasing,
} as const;

/**
 * Create an easing function from cubic bezier control points
 */
export function createBezierEasing(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
): EasingFunction {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const x1 = clamp(p1x);
  const y1 = clamp(p1y);
  const x2 = clamp(p2x);
  const y2 = clamp(p2y);
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleCurveX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleCurveY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDerivativeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solveCurveX = (x: number) => {
    let t2 = x;
    const epsilon = 1e-6;
    for (let i = 0; i < 8; i++) {
      const x2err = sampleCurveX(t2) - x;
      if (Math.abs(x2err) < epsilon) return t2;
      const d2 = sampleDerivativeX(t2);
      if (Math.abs(d2) < epsilon) break;
      t2 -= x2err / d2;
    }
    let t0 = 0;
    let t1 = 1;
    t2 = x;
    while (t0 < t1) {
      const x2err = sampleCurveX(t2);
      if (Math.abs(x2err - x) < epsilon) return t2;
      if (x > x2err) t0 = t2;
      else t1 = t2;
      t2 = (t1 + t0) / 2;
    }
    return t2;
  };
  return (t: number) => {
    const clamped = clamp(t);
    return sampleCurveY(solveCurveX(clamped));
  };
}

/** Resolve easing function by name */
export function getEasingFunction(name: string): EasingFunction {
  const func = easing[name as keyof typeof easing];
  if (!func) return easing.linear;
  return func;
}

/** List all available easing function names */
export function getAllEasingNames(): string[] {
  return Object.keys(easing);
}

// =============================================================================
// BEZIER EVALUATION (original)
// =============================================================================

/**
 * Evaluate a cubic bezier curve at parameter t
 */
export function evaluateBezier(t: number, curve: CubicBezier): number {
  const [x1, y1, x2, y2] = curve;

  // Newton-Raphson iteration to find t for given x
  const epsilon = 1e-6;
  let guess = t;

  for (let i = 0; i < 8; i++) {
    const x =
      3 * (1 - guess) * (1 - guess) * guess * x1 +
      3 * (1 - guess) * guess * guess * x2 +
      guess * guess * guess -
      t;

    if (Math.abs(x) < epsilon) break;

    const dx =
      3 * (1 - guess) * (1 - guess) * x1 +
      6 * (1 - guess) * guess * (x2 - x1) +
      3 * guess * guess * (1 - x2);

    guess -= x / dx;
  }

  // Evaluate y at the found t
  return (
    3 * (1 - guess) * (1 - guess) * guess * y1 +
    3 * (1 - guess) * guess * guess * y2 +
    guess * guess * guess
  );
}

/**
 * Apply speed curve to video timestamps
 * Returns an array of warped timestamps
 */
export function applySpeedCurve(
  duration: number,
  curve: CubicBezier,
  sampleRate: number = 60,
): number[] {
  const timestamps: number[] = [];

  for (let i = 0; i <= sampleRate; i++) {
    const t = i / sampleRate;
    const easedT = evaluateBezier(t, curve);
    timestamps.push(easedT * duration);
  }

  return timestamps;
}

// =============================================================================
// DISPLAY NAMES
// =============================================================================

const EASING_DISPLAY_NAMES: Record<string, string> = {
  easeIn: 'Ease In',
  easeInCirc: 'Ease In Circular',
  easeInCubic: 'Ease In Cubic',
  easeInExpo: 'Ease In Exponential',
  easeInExpoOutCubic: 'Expo In → Cubic Out',
  easeInOut: 'Ease In Out',
  easeInOutCirc: 'Ease In Out Circular',
  easeInOutCubic: 'Ease In Out Cubic',
  easeInOutExpo: 'Ease In Out Exponential',
  easeInOutQuad: 'Ease In Out Quadratic',
  easeInOutQuart: 'Ease In Out Quartic',
  easeInOutQuint: 'Ease In Out Quintic',
  easeInOutSine: 'Ease In Out Sine',
  easeInQuad: 'Ease In Quadratic',
  easeInQuart: 'Ease In Quartic',
  easeInQuartOutQuad: 'Quart In → Quad Out',
  easeInQuint: 'Ease In Quintic',
  easeInSine: 'Ease In Sine',
  easeOut: 'Ease Out',
  easeOutCirc: 'Ease Out Circular',
  easeOutCubic: 'Ease Out Cubic',
  easeOutExpo: 'Ease Out Exponential',
  easeOutQuad: 'Ease Out Quadratic',
  easeOutQuart: 'Ease Out Quartic',
  easeOutQuint: 'Ease Out Quintic',
  easeOutSine: 'Ease Out Sine',
  linear: 'Linear',
};

/**
 * Get display name for easing preset
 */
export function getEasingDisplayName(preset: EasingPreset | string): string {
  return EASING_DISPLAY_NAMES[preset] || preset;
}
