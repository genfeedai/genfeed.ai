import {
  approveStoryboardPlan,
  editStoryboardPlan,
  snapStoryboardDurations,
  storyboardShotPrompt,
} from '@api/collections/content-runs/services/storyboard-plan-state';
import type { StoryboardRunConfig } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { describe, expect, it } from 'vitest';

function fixture(): StoryboardRunConfig {
  return {
    contract: 'storyboard-run',
    version: 1,
    revision: 1,
    clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
    createdByUserId: 'user-1',
    submittedInputHash: 'a'.repeat(64),
    state: 'storyboard',
    sourceSnapshot: {
      selector: { kind: 'brief', brief: 'Show a product' },
      capturedAt: '2026-09-30T12:00:00.000Z',
    },
    plan: {
      title: 'Product',
      logline: '',
      videoModelKey: null,
      format: '9:16',
      runtimeBudgetSeconds: 10,
      styleReferenceAssetIds: [],
      cast: [
        {
          id: 'cast-1',
          name: 'Host',
          voiceId: 'voice-1',
          referenceAssetIds: [],
        },
      ],
      shots: [1, 2].map((ordinal) => ({
        id: `shot-${ordinal}`,
        ordinal,
        action: `Action ${ordinal}`,
        dialogue: 'Hello',
        speakerId: 'cast-1',
        onScreenSpeaker: false,
        durationSeconds: 5,
        stillAssetId: `image-${ordinal}`,
        stillFreshness: 'fresh' as const,
        transition: 'cut' as const,
      })),
    },
  };
}
describe('Storyboard persisted edit and approval', () => {
  it('clears approval and quote while staling only the changed shot', () => {
    const config = fixture();
    config.approvedRevision = 1;
    const plan = structuredClone(config.plan);
    plan.shots[0].action = 'New action';
    const next = editStoryboardPlan(config, plan);
    expect(next.revision).toBe(2);
    expect(next.approvedRevision).toBeUndefined();
    expect(next.plan.shots.map((shot) => shot.stillFreshness)).toEqual([
      'stale',
      'fresh',
    ]);
    expect(config.plan.shots[0].action).toBe('Action 1');
  });
  it('never accepts client-supplied asset IDs or freshness for a new shot', () => {
    const config = fixture();
    const plan = structuredClone(config.plan);
    plan.shots[0].stillAssetId = 'foreign-image';
    plan.shots[0].stillFreshness = 'fresh';
    expect(editStoryboardPlan(config, plan).plan.shots[0].stillAssetId).toBe(
      'image-1',
    );
    plan.runtimeBudgetSeconds = 15;
    plan.shots.push({ ...plan.shots[0], id: 'new', ordinal: 3 });
    expect(editStoryboardPlan(config, plan).plan.shots[2]).toMatchObject({
      stillFreshness: 'missing',
      stillAssetId: undefined,
    });
  });
  it('style changes stale all existing stills; voice changes keep images and clear approval', () => {
    const config = approveStoryboardPlan(fixture());
    const plan = structuredClone(config.plan);
    plan.styleLabel = 'Painterly';
    expect(
      editStoryboardPlan(config, plan).plan.shots.every(
        (shot) => shot.stillFreshness === 'stale',
      ),
    ).toBe(true);
    const voices = structuredClone(config.plan);
    voices.cast[0].voiceId = 'voice-2';
    const recast = editStoryboardPlan(config, voices);
    expect(recast.approvedRevision).toBeUndefined();
    expect(recast.plan.shots[0].stillFreshness).toBe('fresh');
    expect(storyboardShotPrompt(recast.plan, 'shot-1').voiceId).toBe('voice-2');
  });
  it('snaps nearest supported duration with lower ties and rejects an over-budget result', () => {
    const plan = fixture().plan;
    expect(
      snapStoryboardDurations(plan, [6, 4]).shots.map(
        (shot) => shot.durationSeconds,
      ),
    ).toEqual([4, 4]);
    expect(() => snapStoryboardDurations(plan, [8])).toThrow(
      'Shorten another shot',
    );
    expect(() => snapStoryboardDurations(plan, [])).toThrow(
      'supported duration',
    );
  });
  it('blocks incomplete plans, stale stills, and unvoiced dialogue', () => {
    const config = fixture();
    config.plan.runtimeBudgetSeconds = null;
    expect(() => approveStoryboardPlan(config)).toThrow('runtime');
    config.plan.runtimeBudgetSeconds = 10;
    config.plan.shots[0].stillFreshness = 'stale';
    expect(() => approveStoryboardPlan(config)).toThrow('shots 1');
    config.plan.shots[0].stillFreshness = 'fresh';
    config.plan.cast[0].voiceId = undefined;
    expect(() => approveStoryboardPlan(config)).toThrow('shots 1, 2');
  });
  it('excludes notes and sections from prompts and defaults to voiceover', () => {
    const plan = fixture().plan;
    plan.shots[0].notes = 'PRIVATE';
    plan.shots[0].sectionLabel = 'Opening';
    const prompt = storyboardShotPrompt(plan, 'shot-1');
    expect(JSON.stringify(prompt)).not.toContain('PRIVATE');
    expect(prompt).not.toHaveProperty('sectionLabel');
    expect(prompt.dialogueMode).toBe('voiceover');
    plan.cast[0].avatarAssetId = 'avatar-1';
    plan.shots[0].onScreenSpeaker = true;
    expect(storyboardShotPrompt(plan, 'shot-1').dialogueMode).toBe('lip_sync');
  });
});
