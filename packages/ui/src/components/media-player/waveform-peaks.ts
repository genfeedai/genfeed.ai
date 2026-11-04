/** Smallest and largest bar height, as a percentage of the waveform height. */
export const MIN_PEAK = 12;
export const MAX_PEAK = 100;

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextRandom(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) | 0;
  let mixed = Math.imul(next ^ (next >>> 15), 1 | next);
  mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
  return [next, ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296];
}

/**
 * Stable bar heights for one asset. The shared player never decodes the file,
 * so the shape is a fingerprint of the asset (its URL or id), not its audio:
 * the same asset draws the same waveform in the grid, a row and the inspector.
 */
export function createWaveformPeaks(seed: string, count: number): number[] {
  let state = hashSeed(seed);
  const phase = (state % 628) / 100;
  const peaks: number[] = [];

  for (let index = 0; index < count; index += 1) {
    const [nextState, random] = nextRandom(state);
    state = nextState;
    const envelope =
      0.55 + 0.45 * Math.sin((index / count) * Math.PI * 2.4 + phase);
    const peak = 28 + random * 72 * envelope;
    peaks.push(Math.round(Math.min(MAX_PEAK, Math.max(MIN_PEAK, peak))));
  }

  return peaks;
}
