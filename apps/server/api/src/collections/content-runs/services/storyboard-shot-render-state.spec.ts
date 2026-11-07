import {
  appendShotRenderOperations,
  SHOT_RENDER_JOURNAL_CAPACITY,
  type ShotRenderOperation,
  snapShotRenderDuration,
} from '@api/collections/content-runs/services/storyboard-shot-render-state';
import { describe, expect, it } from 'vitest';

function operation(
  index: number,
  shotId: string,
  state: ShotRenderOperation['state'] = 'ready',
): ShotRenderOperation {
  return {
    version: 1,
    operationId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    shotId,
    stage: 'draft',
    actorUserId: 'user-1',
    modelKey: 'acme/cine-2-lite',
    credits: 3,
    billingMode: 'platform',
    inputFingerprint: 'a'.repeat(64),
    prompt: 'A shot.',
    referenceAssetIds: [],
    aspectRatio: '16:9',
    durationSeconds: 4,
    isAudioEnabled: false,
    createdAt: '2026-11-07T12:00:00.000Z',
    updatedAt: '2026-11-07T12:00:00.000Z',
    state,
    billing: 'settled',
  };
}

describe('snapShotRenderDuration', () => {
  it.each([
    [5, [4, 6, 8], 6],
    [6, [8, 4, 6], 6],
    [10, [4, 6, 8], 8],
    [1, [4, 6, 8], 4],
    [5, [], undefined],
  ])('snaps %s seconds over %j to %s', (seconds, durations, expected) => {
    expect(snapShotRenderDuration(seconds, durations)).toBe(expected);
  });
});

describe('appendShotRenderOperations', () => {
  it('prunes old terminal renders but keeps the latest of every shot', () => {
    const journal = Array.from(
      { length: SHOT_RENDER_JOURNAL_CAPACITY },
      (_, index) => operation(index, index === 0 ? 'shot-keep' : 'shot-busy'),
    );
    const next = appendShotRenderOperations(
      journal,
      [operation(900, 'new')],
      new Set(['shot-keep', 'shot-busy', 'new']),
    );
    expect(next).toHaveLength(SHOT_RENDER_JOURNAL_CAPACITY);
    expect(next.map((op) => op.shotId)).toContain('shot-keep');
    expect(next.at(-1)?.shotId).toBe('new');
  });

  it('never prunes a render that is still running', () => {
    const journal = Array.from(
      { length: SHOT_RENDER_JOURNAL_CAPACITY },
      (_, index) => operation(index, `shot-${index}`, 'submitted'),
    );
    const next = appendShotRenderOperations(
      journal,
      [operation(900, 'new')],
      new Set(['new']),
    );
    expect(next).toHaveLength(SHOT_RENDER_JOURNAL_CAPACITY + 1);
  });

  it('prunes the latest render of a shot the plan no longer has', () => {
    const journal = Array.from(
      { length: SHOT_RENDER_JOURNAL_CAPACITY },
      (_, index) => operation(index, `shot-${index}`),
    );
    const next = appendShotRenderOperations(
      journal,
      [operation(900, 'new')],
      new Set(['shot-1', 'new']),
    );
    expect(next).toHaveLength(SHOT_RENDER_JOURNAL_CAPACITY);
    expect(next.map((op) => op.shotId).slice(0, 2)).toEqual([
      'shot-1',
      'shot-2',
    ]);
  });
});
