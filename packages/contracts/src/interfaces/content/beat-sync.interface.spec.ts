import { BeatSyncCutStrategy } from '../../enums/beat-sync.enum';
import {
  describeBeatGrid,
  nearestBeatAlignedSeconds,
  planBeatSyncedCuts,
  selectCutBeats,
} from './beat-sync.interface';

/** 120 BPM from 0.1 s for two minutes: a beat every 0.5 s, a downbeat every 2 s. */
const beats = Array.from({ length: 240 }, (_, index) => 0.1 + index * 0.5);
const downbeats = beats.filter((_, index) => index % 4 === 0);

describe('selectCutBeats', () => {
  it('picks the beats each strategy cuts on', () => {
    const grid = { beatTimestamps: beats, downbeats };
    expect(selectCutBeats(grid, BeatSyncCutStrategy.EVERY_BEAT)).toEqual(beats);
    expect(selectCutBeats(grid, BeatSyncCutStrategy.EVERY_OTHER_BEAT)).toEqual(
      beats.filter((_, index) => index % 2 === 0),
    );
    expect(selectCutBeats(grid, BeatSyncCutStrategy.DOWNBEATS_ONLY)).toEqual(
      downbeats,
    );
  });
});

describe('planBeatSyncedCuts', () => {
  it('ends every clip on a beat without ever stretching one', () => {
    const durations = [5, 5, 4.3, 6, 5.2];
    const plan = planBeatSyncedCuts(durations, beats);

    plan.forEach((clip, index) => {
      expect(clip.isOnBeat).toBe(true);
      expect(
        beats.some((beat) => Math.abs(beat - clip.endSeconds) < 1e-9),
      ).toBe(true);
      expect(clip.durationSeconds).toBeLessThanOrEqual(durations[index] + 1e-9);
      // At most one beat interval is lost to the cut.
      expect(durations[index] - clip.durationSeconds).toBeLessThan(0.5 + 1e-9);
    });
  });

  it('chains cuts on the music clock, not on each clip alone', () => {
    const plan = planBeatSyncedCuts([5, 5], beats);

    expect(plan[0].endSeconds).toBeCloseTo(4.6, 9);
    // The second clip starts at 4.6 s and may keep up to 5 s of picture.
    expect(plan[1].endSeconds).toBeCloseTo(9.6, 9);
    expect(plan[0].durationSeconds + plan[1].durationSeconds).toBeCloseTo(
      plan[1].endSeconds,
      9,
    );
  });

  it('cuts on downbeats only when asked', () => {
    const plan = planBeatSyncedCuts(
      [5, 5, 5],
      selectCutBeats(
        { beatTimestamps: beats, downbeats },
        BeatSyncCutStrategy.DOWNBEATS_ONLY,
      ),
    );

    for (const clip of plan) {
      expect(
        downbeats.some((beat) => Math.abs(beat - clip.endSeconds) < 1e-9),
      ).toBe(true);
    }
  });

  it('keeps a clip whole and reports it off the beat when no beat fits', () => {
    const plan = planBeatSyncedCuts([3, 3], [0.1, 0.6]);

    expect(plan[0]).toEqual({
      durationSeconds: 3,
      endSeconds: 3,
      isOnBeat: false,
    });
    expect(plan[1].endSeconds).toBe(6);
  });

  it('never makes a clip shorter than the minimum', () => {
    const plan = planBeatSyncedCuts([2, 2], beats, 1.5);

    for (const clip of plan) {
      expect(clip.durationSeconds).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('keeps a clip that is already shorter than the minimum', () => {
    const plan = planBeatSyncedCuts([0.4], beats, 1);

    expect(plan[0].durationSeconds).toBeGreaterThan(0);
    expect(plan[0].durationSeconds).toBeLessThanOrEqual(0.4);
  });

  it('is a no-op for an empty edit', () => {
    expect(planBeatSyncedCuts([], beats)).toEqual([]);
  });

  it('snaps each cut to a whole frame without the error building up', () => {
    const frame = 1 / 30;
    const offBeats = Array.from(
      { length: 240 },
      (_, index) => 0.5 * index + 0.4837,
    );
    const durations = Array.from(
      { length: 12 },
      (_, index) => 4.7 + index * 0.13,
    );
    const plan = planBeatSyncedCuts(
      durations,
      offBeats,
      undefined,
      durations.map(() => frame),
    );

    let videoEnd = 0;
    plan.forEach((clip) => {
      const frames = clip.durationSeconds / frame;
      expect(Math.abs(frames - Math.round(frames))).toBeLessThan(1e-6);
      videoEnd += clip.durationSeconds;
      // The video's real end, not a running estimate, sits within half a frame of a beat.
      const nearest = Math.min(
        ...offBeats.map((beat) => Math.abs(beat - videoEnd)),
      );
      expect(nearest).toBeLessThanOrEqual(frame / 2 + 1e-9);
      expect(videoEnd).toBeCloseTo(clip.endSeconds, 9);
    });
  });

  it('keeps cuts monotonic for any clip lengths', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (let round = 0; round < 50; round++) {
      const durations = Array.from({ length: 12 }, () => 1 + random() * 8);
      const plan = planBeatSyncedCuts(durations, beats);
      let previous = 0;
      plan.forEach((clip, index) => {
        expect(clip.endSeconds).toBeGreaterThan(previous);
        expect(clip.durationSeconds).toBeLessThanOrEqual(
          durations[index] + 1e-9,
        );
        previous = clip.endSeconds;
      });
    }
  });
});

describe('nearestBeatAlignedSeconds', () => {
  it('rounds a target length to whole beats, half bars or bars', () => {
    expect(nearestBeatAlignedSeconds(120, 5.2)).toBeCloseTo(5, 9);
    expect(
      nearestBeatAlignedSeconds(120, 5.2, BeatSyncCutStrategy.EVERY_OTHER_BEAT),
    ).toBeCloseTo(5, 9);
    expect(
      nearestBeatAlignedSeconds(120, 5.2, BeatSyncCutStrategy.DOWNBEATS_ONLY),
    ).toBeCloseTo(6, 9);
  });

  it('never returns less than one cut', () => {
    expect(nearestBeatAlignedSeconds(120, 0.1)).toBeCloseTo(0.5, 9);
  });
});

describe('describeBeatGrid', () => {
  it('states the tempo and the clip lengths that lose nothing', () => {
    const text = describeBeatGrid({ tempo: 120 });

    expect(text).toContain('120 BPM');
    expect(text).toContain('0.50s');
    expect(text).toContain('2.00s');
  });
});
