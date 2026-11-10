/** Longest side image models take for a brand kit generation. */
const MAX_GENERATION_SIDE = 1536;
/** Image models require each side to be a multiple of this. */
const GENERATION_STEP = 16;
const MIN_GENERATION_SIDE = 256;

function toStep(value: number): number {
  return Math.max(
    MIN_GENERATION_SIDE,
    Math.round(value / GENERATION_STEP) * GENERATION_STEP,
  );
}

/**
 * Generation size for a platform slot: the slot's ratio, scaled so the long
 * side fits the model limit, each side a multiple of 16. Rounding to the step
 * moves the ratio by at most a few percent, which the slot preview absorbs.
 */
export function resolveBrandKitGenerationSize(
  width: number,
  height: number,
): { width: number; height: number } {
  const scale = Math.min(1, MAX_GENERATION_SIDE / Math.max(width, height));
  return { height: toStep(height * scale), width: toStep(width * scale) };
}
