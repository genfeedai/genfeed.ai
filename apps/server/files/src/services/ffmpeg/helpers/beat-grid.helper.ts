/**
 * Tempo and beat grid from decoded mono audio, with no native dependency.
 *
 * The onset envelope is the positive change of the log-compressed spectrum
 * (spectral flux). The tempo is the strongest periodicity of that envelope
 * inside the BPM range, weighted toward everyday tempos so a half or double
 * reading does not win. The grid is the regular comb of that period whose
 * beats sit on the strongest onsets, and every fourth beat is a downbeat.
 */

export interface BeatGridAnalysis {
  /** 0–1: how periodic the onsets are at the chosen tempo. */
  confidence: number;
  /** Seconds; every fourth beat, starting on the strongest bar position. */
  downbeats: number[];
  /** Seconds, evenly spaced at the detected tempo. */
  beatTimestamps: number[];
  tempo: number;
}

export interface BeatGridOptions {
  maxBpm?: number;
  minBpm?: number;
}

const FRAME_SIZE = 1024;
const HOP_SIZE = 256;
/** Highest bin read: ~8 kHz at 22.05 kHz, where percussive onsets live. */
const MAX_BIN_HZ = 8_000;
const PREFERRED_BPM = 120;
/** Width of the tempo prior, in octaves. */
const PRIOR_OCTAVES = 1.2;
/** Below this the clip has no usable pulse. */
const MIN_ENVELOPE_PEAK = 1e-6;

function hann(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let index = 0; index < size; index++) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1));
  }
  return window;
}

/** In-place radix-2 FFT. `real.length` must be a power of two. */
function fft(real: Float32Array, imaginary: Float32Array): void {
  const size = real.length;
  for (let index = 1, swap = 0; index < size; index++) {
    let bit = size >> 1;
    for (; swap & bit; bit >>= 1) {
      swap ^= bit;
    }
    swap ^= bit;
    if (index < swap) {
      [real[index], real[swap]] = [real[swap], real[index]];
      [imaginary[index], imaginary[swap]] = [imaginary[swap], imaginary[index]];
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let start = 0; start < size; start += length) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let offset = 0; offset < length / 2; offset++) {
        const even = start + offset;
        const odd = even + length / 2;
        const oddReal =
          real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary;
        const oddImaginary =
          real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextReal =
          twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary =
          twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextReal;
      }
    }
  }
}

/**
 * Onset strength per hop: summed positive change of the log spectrum, with
 * the local average removed so a loud passage does not read as a pulse.
 */
export function computeOnsetEnvelope(
  samples: Float32Array,
  sampleRate: number,
): Float32Array {
  const frames = Math.floor((samples.length - FRAME_SIZE) / HOP_SIZE) + 1;
  if (frames < 2) {
    return new Float32Array(0);
  }
  const window = hann(FRAME_SIZE);
  const maxBin = Math.min(
    FRAME_SIZE / 2,
    Math.floor((MAX_BIN_HZ / sampleRate) * FRAME_SIZE),
  );
  const real = new Float32Array(FRAME_SIZE);
  const imaginary = new Float32Array(FRAME_SIZE);
  let previous = new Float32Array(maxBin);
  let current = new Float32Array(maxBin);
  const flux = new Float32Array(frames);

  for (let frame = 0; frame < frames; frame++) {
    const start = frame * HOP_SIZE;
    for (let index = 0; index < FRAME_SIZE; index++) {
      real[index] = samples[start + index] * window[index];
      imaginary[index] = 0;
    }
    fft(real, imaginary);
    let sum = 0;
    for (let bin = 0; bin < maxBin; bin++) {
      current[bin] = Math.log1p(
        (100 * Math.hypot(real[bin], imaginary[bin])) / FRAME_SIZE,
      );
      if (frame > 0) {
        sum += Math.max(0, current[bin] - previous[bin]);
      }
    }
    flux[frame] = sum;
    [previous, current] = [current, previous];
  }

  // Remove the moving average (~0.4 s) and keep what rises above it.
  const hopsPerSecond = sampleRate / HOP_SIZE;
  const radius = Math.max(1, Math.round(0.2 * hopsPerSecond));
  const prefix = new Float64Array(frames + 1);
  for (let index = 0; index < frames; index++) {
    prefix[index + 1] = prefix[index] + flux[index];
  }
  const envelope = new Float32Array(frames);
  for (let index = 0; index < frames; index++) {
    const from = Math.max(0, index - radius);
    const to = Math.min(frames, index + radius + 1);
    const mean = (prefix[to] - prefix[from]) / (to - from);
    envelope[index] = Math.max(0, flux[index] - mean);
  }
  return envelope;
}

function autocorrelation(envelope: Float32Array, lag: number): number {
  let sum = 0;
  for (let index = lag; index < envelope.length; index++) {
    sum += envelope[index] * envelope[index - lag];
  }
  return sum / (envelope.length - lag);
}

/** The beat period, in hops, with the strongest weighted periodicity. */
function estimatePeriod(
  envelope: Float32Array,
  hopsPerSecond: number,
  minBpm: number,
  maxBpm: number,
): { confidence: number; period: number } | null {
  const minLag = Math.max(1, Math.floor((60 / maxBpm) * hopsPerSecond));
  const maxLag = Math.min(
    envelope.length - 2,
    Math.ceil((60 / minBpm) * hopsPerSecond),
  );
  if (maxLag <= minLag + 1) {
    return null;
  }
  const zeroLag = autocorrelation(envelope, 0);
  if (zeroLag <= 0) {
    return null;
  }
  const scores = new Float64Array(maxLag + 2);
  let best = minLag;
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    const bpm = (60 * hopsPerSecond) / lag;
    const octaves = Math.log2(bpm / PREFERRED_BPM);
    const prior = Math.exp(-0.5 * (octaves / PRIOR_OCTAVES) ** 2);
    scores[lag] = autocorrelation(envelope, lag) * prior;
    if (lag <= maxLag && scores[lag] > scores[best]) {
      best = lag;
    }
  }
  if (scores[best] <= 0) {
    return null;
  }
  // Parabolic interpolation gives a sub-hop period; the grid needs it so the
  // error does not add up over a long track.
  const left = scores[best - 1] ?? scores[best];
  const right = scores[best + 1] ?? scores[best];
  const denominator = left - 2 * scores[best] + right;
  const shift = denominator < 0 ? (0.5 * (left - right)) / denominator : 0;
  return {
    confidence: Math.min(
      1,
      Math.max(0, autocorrelation(envelope, best) / zeroLag),
    ),
    period: best + Math.max(-0.5, Math.min(0.5, shift)),
  };
}

/** Envelope value at a fractional hop, taking the strongest nearby hop. */
function envelopeAt(envelope: Float32Array, position: number): number {
  const center = Math.round(position);
  let peak = 0;
  for (let index = center - 1; index <= center + 1; index++) {
    if (index >= 0 && index < envelope.length) {
      peak = Math.max(peak, envelope[index]);
    }
  }
  return peak;
}

export function analyzeBeatGrid(
  samples: Float32Array,
  sampleRate: number,
  options: BeatGridOptions = {},
): BeatGridAnalysis | null {
  const { maxBpm = 200, minBpm = 60 } = options;
  const envelope = computeOnsetEnvelope(samples, sampleRate);
  if (envelope.length === 0) {
    return null;
  }
  let peak = 0;
  for (const value of envelope) {
    peak = Math.max(peak, value);
  }
  if (peak < MIN_ENVELOPE_PEAK) {
    return null;
  }
  const hopsPerSecond = sampleRate / HOP_SIZE;
  const estimate = estimatePeriod(envelope, hopsPerSecond, minBpm, maxBpm);
  if (!estimate) {
    return null;
  }
  const { confidence, period } = estimate;

  // The comb offset whose beats collect the most onset strength.
  let offset = 0;
  let bestSum = -1;
  const steps = Math.max(1, Math.ceil(period));
  for (let step = 0; step < steps; step++) {
    let sum = 0;
    for (let position = step; position < envelope.length; position += period) {
      sum += envelopeAt(envelope, position);
    }
    if (sum > bestSum) {
      bestSum = sum;
      offset = step;
    }
  }

  const duration = samples.length / sampleRate;
  const beatTimestamps: number[] = [];
  const beatPositions: number[] = [];
  for (
    let position = offset;
    position / hopsPerSecond < duration;
    position += period
  ) {
    // A frame at hop `h` covers samples from `h * HOP_SIZE`; its center is
    // half a frame later, which is where the onset lands in time.
    beatTimestamps.push(
      Math.round(((position * HOP_SIZE + FRAME_SIZE / 2) / sampleRate) * 1000) /
        1000,
    );
    beatPositions.push(position);
  }
  if (beatTimestamps.length === 0) {
    return null;
  }

  // The bar position (0–3) whose beats are strongest marks the downbeats.
  const barStrength = [0, 0, 0, 0];
  for (const [index, position] of beatPositions.entries()) {
    barStrength[index % 4] += envelopeAt(envelope, position);
  }
  const barStart = barStrength.indexOf(Math.max(...barStrength));
  const downbeats = beatTimestamps.filter((_, index) => index % 4 === barStart);

  return {
    beatTimestamps,
    confidence,
    downbeats,
    tempo: Math.round(((60 * hopsPerSecond) / period) * 100) / 100,
  };
}
