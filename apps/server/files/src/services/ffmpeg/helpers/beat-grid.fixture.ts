export const FIXTURE_SAMPLE_RATE = 22_050;

export interface ClickTrackOptions {
  /** Louder click on every fourth beat, as a kick on the bar. */
  hasBarAccent?: boolean;
  /** Seconds before the first beat. */
  offsetSeconds?: number;
  /** Uniform noise floor under the clicks. */
  noise?: number;
  seconds: number;
  tempo: number;
}

/** A deterministic track of decaying clicks, with the beat times it contains. */
export function renderClickTrack(options: ClickTrackOptions): {
  beats: number[];
  samples: Float32Array;
} {
  const {
    hasBarAccent = true,
    noise = 0,
    offsetSeconds = 0,
    seconds,
    tempo,
  } = options;
  const samples = new Float32Array(Math.floor(seconds * FIXTURE_SAMPLE_RATE));
  let seed = 1;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32 - 0.5;
  };
  const period = 60 / tempo;
  const beats: number[] = [];
  for (let index = 0; offsetSeconds + index * period < seconds; index++) {
    const time = offsetSeconds + index * period;
    beats.push(time);
    const amplitude = hasBarAccent && index % 4 === 0 ? 1 : 0.6;
    const start = Math.floor(time * FIXTURE_SAMPLE_RATE);
    for (let step = 0; step < 2000 && start + step < samples.length; step++) {
      samples[start + step] +=
        amplitude *
        Math.exp(-step / 300) *
        (0.7 * Math.sin((2 * Math.PI * 180 * step) / FIXTURE_SAMPLE_RATE) +
          0.6 * random());
    }
  }
  if (noise > 0) {
    for (let index = 0; index < samples.length; index++) {
      samples[index] += noise * random();
    }
  }
  return { beats, samples };
}

/** The distance from `time` to the nearest beat in `beats`. */
export function distanceToNearest(time: number, beats: number[]): number {
  return Math.min(...beats.map((beat) => Math.abs(beat - time)));
}
