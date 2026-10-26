import {
  matchStoryboardARollChunks,
  planStoryboardARollChunks,
  storyboardARollJoins,
} from '@api/collections/content-runs/services/storyboard-a-roll-plan';
import type { StoryboardARollChunk } from '@genfeedai/contracts/api-types/contracts/storyboard-a-roll.contract';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

function plan(narrations: string[]): StoryboardPlan {
  return {
    videoModelKey: null,
    title: 'Pricing',
    logline: '',
    format: '16:9',
    runtimeBudgetSeconds: null,
    styleReferenceAssetIds: [],
    cast: [
      {
        id: 'presenter',
        name: 'Presenter',
        avatarAssetId: 'avatar-1',
        voiceId: 'voice-1',
        referenceAssetIds: [],
      },
    ],
    shots: [],
    longForm: {
      runtimeBudgetSeconds: 1_800,
      presenterId: 'presenter',
      segments: narrations.map((narration, index) => ({
        id: `segment-${index + 1}`,
        ordinal: index + 1,
        narration,
        estimatedSeconds: 10,
        cutaways: [],
      })),
    },
  };
}

function chunk(
  overrides: Partial<StoryboardARollChunk> = {},
): StoryboardARollChunk {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    ordinal: 1,
    pieces: [{ segmentId: 'segment-1', start: 0, end: 10 }],
    text: 'Hello all.',
    fingerprint: 'a'.repeat(64),
    estimatedSeconds: 1,
    state: 'ready',
    actorUserId: 'user-1',
    credits: 10,
    billingMode: 'platform',
    createdAt: '2026-10-26T12:00:00.000Z',
    updatedAt: '2026-10-26T12:00:00.000Z',
    ...overrides,
  };
}

describe('planStoryboardARollChunks', () => {
  it('keeps a short narration in one render across segments', () => {
    const chunks = planStoryboardARollChunks(
      plan(['First point. Second point.', 'Third point!']),
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe('First point. Second point. Third point!');
    expect(chunks[0]?.pieces).toEqual([
      { segmentId: 'segment-1', start: 0, end: 26 },
      { segmentId: 'segment-2', start: 0, end: 12 },
    ]);
  });

  it('splits at sentence boundaries without passing the limit', () => {
    const sentence = `${'word '.repeat(19)}end.`; // 99 characters
    const narration = Array.from({ length: 4 }, () => sentence).join(' ');
    const chunks = planStoryboardARollChunks(plan([narration]), 220);

    expect(chunks.map((item) => item.text.length)).toEqual([199, 199]);
    expect(chunks[1]?.pieces[0]).toEqual({
      segmentId: 'segment-1',
      start: 200,
      end: 399,
    });
    for (const item of chunks)
      for (const piece of item.pieces)
        expect(narration.slice(piece.start, piece.end)).toBe(item.text);
  });

  it('splits a sentence longer than one render at word boundaries', () => {
    const chunks = planStoryboardARollChunks(
      plan([`${'word '.repeat(60)}end.`]),
      100,
    );

    expect(chunks.length).toBeGreaterThan(1);
    for (const item of chunks) {
      expect(item.text.length).toBeLessThanOrEqual(100);
      expect(item.text.startsWith(' ')).toBe(false);
    }
  });

  it('changes the fingerprint when the voice changes', () => {
    const before = planStoryboardARollChunks(plan(['Hello all.']));
    const changed = plan(['Hello all.']);
    changed.cast = changed.cast.map((member) => ({
      ...member,
      voiceId: 'voice-2',
    }));

    expect(planStoryboardARollChunks(changed)[0]?.fingerprint).not.toBe(
      before[0]?.fingerprint,
    );
  });

  it('refuses a presenter without a voice', () => {
    const missing = plan(['Hello all.']);
    missing.cast = missing.cast.map(({ voiceId: _voice, ...member }) => member);

    expect(() => planStoryboardARollChunks(missing)).toThrow(ConflictException);
  });
});

describe('matchStoryboardARollChunks', () => {
  it('reuses renders of unchanged text and re-renders failed ones', () => {
    const [first, second] = planStoryboardARollChunks(
      plan(['One sentence here.', 'Another sentence.']),
      20,
    );
    if (!first || !second) throw new Error('Expected two chunks');

    const matches = matchStoryboardARollChunks(
      [first, second],
      [
        chunk({ fingerprint: first.fingerprint }),
        chunk({
          id: '22222222-2222-4222-8222-222222222222',
          fingerprint: second.fingerprint,
          state: 'failed',
        }),
      ],
    );

    expect(matches[0]?.previous?.id).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(matches[1]?.previous).toBeUndefined();
  });
});

describe('storyboardARollJoins', () => {
  it('times joins once earlier chunks are measured', () => {
    const joins = storyboardARollJoins([
      chunk({ durationSeconds: 120 }),
      chunk({
        id: '22222222-2222-4222-8222-222222222222',
        ordinal: 2,
        pieces: [{ segmentId: 'segment-3', start: 40, end: 90 }],
        durationSeconds: 100,
      }),
      chunk({
        id: '33333333-3333-4333-8333-333333333333',
        ordinal: 3,
        pieces: [{ segmentId: 'segment-5', start: 0, end: 20 }],
      }),
    ]);

    expect(joins).toEqual([
      {
        afterChunkId: '11111111-1111-4111-8111-111111111111',
        beforeChunkId: '22222222-2222-4222-8222-222222222222',
        segmentId: 'segment-3',
        characterOffset: 40,
        atSeconds: 120,
      },
      {
        afterChunkId: '22222222-2222-4222-8222-222222222222',
        beforeChunkId: '33333333-3333-4333-8333-333333333333',
        segmentId: 'segment-5',
        characterOffset: 0,
        atSeconds: 220,
      },
    ]);
  });
});
