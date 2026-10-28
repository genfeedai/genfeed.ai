import {
  distanceToNearest,
  FIXTURE_SAMPLE_RATE,
  renderClickTrack,
} from '@files/services/ffmpeg/helpers/beat-grid.fixture';
import { analyzeBeatGrid } from '@files/services/ffmpeg/helpers/beat-grid.helper';

/** Tight enough that a cut on the grid reads as on the beat (one frame at 30 fps). */
const BEAT_TOLERANCE_SECONDS = 0.035;

describe('analyzeBeatGrid', () => {
  it.each([
    { noise: 0, offsetSeconds: 0.2, tempo: 120 },
    { noise: 0.05, offsetSeconds: 0.35, tempo: 90 },
    { noise: 0.05, offsetSeconds: 0.1, tempo: 140 },
    { noise: 0.1, offsetSeconds: 0.5, tempo: 75 },
    { noise: 0, offsetSeconds: 0, tempo: 100 },
  ])(
    'finds the tempo and puts every beat on a click at $tempo BPM',
    ({ noise, offsetSeconds, tempo }) => {
      const { beats, samples } = renderClickTrack({
        noise,
        offsetSeconds,
        seconds: 40,
        tempo,
      });

      const grid = analyzeBeatGrid(samples, FIXTURE_SAMPLE_RATE);

      expect(grid).not.toBeNull();
      expect(Math.abs((grid?.tempo ?? 0) - tempo)).toBeLessThan(1);
      expect(grid?.confidence).toBeGreaterThan(0.5);
      for (const beat of grid?.beatTimestamps ?? []) {
        expect(distanceToNearest(beat, beats)).toBeLessThan(
          BEAT_TOLERANCE_SECONDS,
        );
      }
    },
  );

  it('keeps a constant beat interval across the whole track', () => {
    const { samples } = renderClickTrack({ seconds: 60, tempo: 128 });

    const grid = analyzeBeatGrid(samples, FIXTURE_SAMPLE_RATE);

    const timestamps = grid?.beatTimestamps ?? [];
    const interval = (timestamps.at(-1) ?? 0) - (timestamps[0] ?? 0);
    expect(interval / (timestamps.length - 1)).toBeCloseTo(60 / 128, 2);
  });

  it('may read a very fast pulse as half time, which still lands on beats', () => {
    const { beats, samples } = renderClickTrack({ seconds: 40, tempo: 170 });

    const grid = analyzeBeatGrid(samples, FIXTURE_SAMPLE_RATE);

    expect(
      [85, 170].some((tempo) => Math.abs((grid?.tempo ?? 0) - tempo) < 1.5),
    ).toBe(true);
    for (const beat of grid?.beatTimestamps ?? []) {
      expect(distanceToNearest(beat, beats)).toBeLessThan(
        BEAT_TOLERANCE_SECONDS,
      );
    }
  });

  it('marks every fourth beat from the accented one as a downbeat', () => {
    const { beats, samples } = renderClickTrack({
      offsetSeconds: 0.3,
      seconds: 40,
      tempo: 120,
    });

    const grid = analyzeBeatGrid(samples, FIXTURE_SAMPLE_RATE);

    const downbeats = grid?.downbeats ?? [];
    expect(downbeats.length).toBeGreaterThan(5);
    for (const downbeat of downbeats) {
      // Accents are the clicks at 0.3 s + n * 2 s.
      expect(
        distanceToNearest(
          downbeat,
          beats.filter((_, i) => i % 4 === 0),
        ),
      ).toBeLessThan(BEAT_TOLERANCE_SECONDS);
    }
  });

  it('keeps the requested tempo range', () => {
    const { samples } = renderClickTrack({ seconds: 40, tempo: 100 });

    const grid = analyzeBeatGrid(samples, FIXTURE_SAMPLE_RATE, {
      maxBpm: 140,
      minBpm: 90,
    });

    expect(grid?.tempo).toBeGreaterThanOrEqual(90);
    expect(grid?.tempo).toBeLessThanOrEqual(140);
  });

  it('finds no pulse in silence', () => {
    expect(
      analyzeBeatGrid(
        new Float32Array(FIXTURE_SAMPLE_RATE * 10),
        FIXTURE_SAMPLE_RATE,
      ),
    ).toBeNull();
  });

  it('finds no pulse in a clip too short to analyze', () => {
    expect(
      analyzeBeatGrid(new Float32Array(500), FIXTURE_SAMPLE_RATE),
    ).toBeNull();
  });
});
