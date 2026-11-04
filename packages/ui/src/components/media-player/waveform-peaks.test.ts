import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createWaveformPeaks, MAX_PEAK, MIN_PEAK } from './waveform-peaks';

describe('createWaveformPeaks', () => {
  it('draws the same waveform for the same asset every time', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer({ max: 96, min: 1 }),
        (seed, count) => {
          expect(createWaveformPeaks(seed, count)).toEqual(
            createWaveformPeaks(seed, count),
          );
        },
      ),
    );
  });

  it('returns exactly the requested bars, all within the drawable range', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer({ max: 96, min: 0 }),
        (seed, count) => {
          const peaks = createWaveformPeaks(seed, count);
          expect(peaks).toHaveLength(count);
          expect(
            peaks.every((peak) => peak >= MIN_PEAK && peak <= MAX_PEAK),
          ).toBe(true);
        },
      ),
    );
  });

  it('gives different assets different shapes', () => {
    expect(createWaveformPeaks('voice-a.mp3', 40)).not.toEqual(
      createWaveformPeaks('voice-b.mp3', 40),
    );
  });
});
