import {
  appendStillOperations,
  STILL_JOURNAL_CAPACITY,
  type StillOperation,
  storyboardStillInput,
} from '@api/collections/content-runs/services/storyboard-still-state';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { DRAFT_GENERATION_CONFIG } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

function plan(): StoryboardPlan {
  return {
    title: '',
    logline: '',
    videoModelKey: null,
    format: '16:9',
    runtimeBudgetSeconds: 10,
    styleLabel: 'Neon noir',
    styleReferenceAssetIds: ['style-1'],
    cast: [
      { id: 'a', name: 'Ana', referenceAssetIds: ['ana-1'] },
      { id: 'b', name: 'Bo', referenceAssetIds: ['bo-1'] },
    ],
    shots: [
      {
        id: 'shot-1',
        ordinal: 1,
        action: 'Ana hands a parcel to a robot.',
        notes: 'Private note',
        dialogue: 'Here you go',
        onScreenSpeaker: false,
        durationSeconds: 5,
        stillFreshness: 'missing',
        transition: 'cut',
      },
    ],
  };
}

function op(index: number, state: StillOperation['state']): StillOperation {
  return {
    version: 1,
    operationId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    shotId: 'shot-1',
    actorUserId: 'user-1',
    modelKey: DRAFT_GENERATION_CONFIG.draftModelKey,
    credits: 4,
    billingMode: 'platform',
    fingerprint: 'a'.repeat(64),
    prompt: 'A sketch',
    referenceAssetIds: [],
    aspectRatio: '9:16',
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    state,
    billing: 'none',
  };
}

describe('storyboardStillInput', () => {
  it('builds a sketch prompt from the action and named cast only', () => {
    const input = storyboardStillInput(plan(), 'shot-1');
    expect(input.prompt).toBe(
      `Ana hands a parcel to a robot. Keep every person consistent with the reference images. ${DRAFT_GENERATION_CONFIG.sketchStyle}`,
    );
    expect(input.prompt).not.toMatch(/Private note|Here you go|Neon noir|Bo/);
    expect(input.referenceAssetIds).toEqual(['ana-1', 'style-1']);
    expect(input.aspectRatio).toBe('16:9');
  });

  it('changes its fingerprint with the action but not with a reorder', () => {
    const base = storyboardStillInput(plan(), 'shot-1').fingerprint;
    const edited = plan();
    edited.shots[0].action = 'Bo waves.';
    expect(storyboardStillInput(edited, 'shot-1').fingerprint).not.toBe(base);
    const renumbered = plan();
    renumbered.shots[0].sectionLabel = 'Opening';
    expect(storyboardStillInput(renumbered, 'shot-1').fingerprint).toBe(base);
  });
});

describe('appendStillOperations', () => {
  it('prunes the oldest finished operations and never a live one', () => {
    const journal = [
      op(0, 'submitted'),
      ...Array.from({ length: STILL_JOURNAL_CAPACITY - 1 }, (_, index) =>
        op(index + 1, 'ready'),
      ),
    ];
    const next = appendStillOperations(journal, [op(999, 'pending')]);
    expect(next).toHaveLength(STILL_JOURNAL_CAPACITY);
    expect(next[0].state).toBe('submitted');
    expect(next.at(-1)?.state).toBe('pending');
    expect(
      next.some((item) => item.operationId === journal[1].operationId),
    ).toBe(false);
  });
});
