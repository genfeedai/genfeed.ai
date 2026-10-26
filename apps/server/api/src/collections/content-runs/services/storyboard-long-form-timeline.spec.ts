import {
  buildLongFormTimeline,
  LONG_FORM_J_CUT_LEAD_SECONDS,
} from '@api/collections/content-runs/services/storyboard-long-form-timeline';
import type { StoryboardARollChunk } from '@genfeedai/contracts/api-types/contracts/storyboard-a-roll.contract';
import type {
  StoryboardCutaway,
  StoryboardPlan,
} from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { describe, expect, it } from 'vitest';

// Ten sentences of 99 characters plus spaces: 999 characters per segment.
const SENTENCE = `${'word '.repeat(19)}end.`;
const NARRATION = Array.from({ length: 10 }, () => SENTENCE).join(' ');

function cutaway(overrides: Partial<StoryboardCutaway>): StoryboardCutaway {
  return {
    id: 'cutaway-1',
    kind: 'still',
    brief: 'Chart',
    startSeconds: 0,
    durationSeconds: 5,
    ...overrides,
  };
}

function plan(cutaways: StoryboardCutaway[][]): StoryboardPlan {
  return {
    videoModelKey: null,
    title: 'Pricing',
    logline: '',
    format: '16:9',
    runtimeBudgetSeconds: null,
    styleReferenceAssetIds: [],
    cast: [],
    shots: [],
    longForm: {
      runtimeBudgetSeconds: 600,
      segments: cutaways.map((items, index) => ({
        id: `segment-${index + 1}`,
        ordinal: index + 1,
        narration: NARRATION,
        // Drafted at 12 characters per second.
        estimatedSeconds: 84,
        cutaways: items,
      })),
    },
  };
}

function chunk(
  ordinal: number,
  segmentId: string,
  durationSeconds: number,
): StoryboardARollChunk {
  return {
    id: `0000000${ordinal}-0000-4000-8000-000000000000`,
    ordinal,
    pieces: [{ segmentId, start: 0, end: NARRATION.length }],
    text: NARRATION,
    fingerprint: 'a'.repeat(64),
    estimatedSeconds: 84,
    durationSeconds,
    state: 'ready',
    assetId: `asset-${ordinal}`,
    actorUserId: 'user-1',
    credits: 0,
    billingMode: 'byok',
    createdAt: '2026-10-26T12:00:00.000Z',
    updatedAt: '2026-10-26T12:00:00.000Z',
  };
}

describe('buildLongFormTimeline', () => {
  it('plays presenter renders back to back at their measured length', () => {
    const timeline = buildLongFormTimeline(plan([[], []]), [
      chunk(1, 'segment-1', 100),
      chunk(2, 'segment-2', 90),
    ]);

    expect(timeline.totalSeconds).toBe(190);
    expect(timeline.aRoll).toEqual([
      {
        chunkId: '00000001-0000-4000-8000-000000000000',
        assetId: 'asset-1',
        startSeconds: 0,
        durationSeconds: 100,
      },
      {
        chunkId: '00000002-0000-4000-8000-000000000000',
        assetId: 'asset-2',
        startSeconds: 100,
        durationSeconds: 90,
      },
    ]);
    expect(timeline.uncoveredJoins).toEqual([100]);
  });

  it('scales cutaways to the measured speech and cuts just after a line starts', () => {
    // The second sentence starts at character 100 of 999: 10.01 s into a
    // 100 s render.
    const timeline = buildLongFormTimeline(
      plan([[cutaway({ startSeconds: 8.2, durationSeconds: 12 })]]),
      [chunk(1, 'segment-1', 100)],
    );

    const [placed] = timeline.cutaways;
    expect(placed?.startSeconds).toBeCloseTo(
      (100 * 100) / 999 + LONG_FORM_J_CUT_LEAD_SECONDS,
    );
    // The drafted end scales to 24.05 s, more than a second from any
    // sentence start, so it stays where the speech puts it.
    expect(
      (placed?.startSeconds ?? 0) + (placed?.durationSeconds ?? 0),
    ).toBeCloseTo((8.2 + 12) * (100 / 84));
  });

  it('stretches a nearby cutaway to hide a presenter join', () => {
    const timeline = buildLongFormTimeline(
      plan([[cutaway({ startSeconds: 76, durationSeconds: 6 })], []]),
      [chunk(1, 'segment-1', 84), chunk(2, 'segment-2', 84)],
    );

    expect(timeline.uncoveredJoins).toEqual([]);
    const [cover] = timeline.cutaways;
    expect(cover?.isJoinCover).toBe(true);
    expect(cover?.startSeconds).toBeLessThanOrEqual(83.5);
    expect(
      (cover?.startSeconds ?? 0) + (cover?.durationSeconds ?? 0),
    ).toBeGreaterThanOrEqual(84.5);
  });

  it('never overlaps two cutaways', () => {
    const timeline = buildLongFormTimeline(
      plan([
        [
          cutaway({ id: 'a', startSeconds: 2, durationSeconds: 20 }),
          cutaway({ id: 'b', startSeconds: 15, durationSeconds: 20 }),
        ],
      ]),
      [chunk(1, 'segment-1', 84)],
    );

    const [first, second] = timeline.cutaways;
    expect(second?.startSeconds).toBeGreaterThanOrEqual(
      (first?.startSeconds ?? 0) + (first?.durationSeconds ?? 0) - 0.001,
    );
  });
});
