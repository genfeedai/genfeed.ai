import { describe, expect, it } from 'vitest';
import {
  storyboardImportedPlanSchema,
  storyboardPlanSchema,
} from '../../src/api-types/contracts/storyboard-plan.contract';
import {
  createStoryboardRunSchema,
  storyboardRunConfigSchema,
} from '../../src/api-types/contracts/storyboard-run.contract';
import { storyboardVideoModelCapabilitySchema } from '../../src/api-types/contracts/storyboard-run-capabilities.contract';
import { createStoryboardRunQuoteSchema } from '../../src/api-types/contracts/storyboard-run-quote.contract';
import { storyboardSourceSnapshotSchema } from '../../src/api-types/contracts/storyboard-source.contract';

const requestId = 'd160833e-d602-4617-a21b-721eb9aa7da8';
const plan = {
  title: '',
  logline: '',
  format: '9:16',
  runtimeBudgetSeconds: null,
  styleReferenceAssetIds: [],
  cast: [],
  shots: [],
};
describe('Canonical storyboard contract', () => {
  it('accepts provider-qualified keys, requires ordered durations and refuses invented defaults', () => {
    const model = {
      key: 'provider/video-model',
      label: 'Video',
      provider: 'replicate',
      supportedDurationsSeconds: [4, 6],
      defaultDurationSeconds: null,
      hasInterpolation: false,
      supportedFormats: ['9:16'],
      capabilitySource: 'catalog',
    };
    expect(storyboardVideoModelCapabilitySchema.safeParse(model).success).toBe(
      true,
    );
    expect(
      storyboardVideoModelCapabilitySchema.safeParse({
        ...model,
        supportedDurationsSeconds: [6, 4],
      }).success,
    ).toBe(false);
    expect(
      storyboardVideoModelCapabilitySchema.safeParse({
        ...model,
        supportedDurationsSeconds: [],
      }).success,
    ).toBe(false);
    expect(
      storyboardVideoModelCapabilitySchema.safeParse({
        ...model,
        defaultDurationSeconds: 5,
      }).success,
    ).toBe(false);
    expect(
      storyboardPlanSchema.parse({ ...plan, videoModelKey: model.key })
        .videoModelKey,
    ).toBe(model.key);
    expect(storyboardPlanSchema.parse(plan).videoModelKey).toBeNull();
  });

  it('requires an intent UUID and accepts a seeded draft without settings or invented budget', () => {
    expect(
      createStoryboardRunSchema.parse({
        clientRequestId: requestId,
        source: { kind: 'brief', brief: '', seedImageAssetId: 'image-1' },
      }).planSettings,
    ).toBeUndefined();
    expect(storyboardPlanSchema.parse(plan).runtimeBudgetSeconds).toBeNull();
    expect(
      createStoryboardRunSchema.safeParse({
        source: { kind: 'uploaded_video', assetId: 'video-1' },
      }).success,
    ).toBe(false);
  });
  it('allows empty brief only with a seed and rejects overlong briefs', () => {
    for (const brief of ['', 'a'.repeat(2_001)])
      expect(
        createStoryboardRunSchema.safeParse({
          clientRequestId: requestId,
          source: { kind: 'brief', brief },
        }).success,
      ).toBe(false);
  });
  it('accepts 12 shots with stable contiguous ordinals and rejects a thirteenth or duplicates', () => {
    const shots = Array.from({ length: 12 }, (_, index) => ({
      id: `shot-${index}`,
      ordinal: index + 1,
      action: 'Action',
      onScreenSpeaker: false,
      durationSeconds: 5,
      stillFreshness: 'missing',
      transition: 'cut',
    }));
    expect(
      storyboardPlanSchema.safeParse({
        ...plan,
        runtimeBudgetSeconds: 60,
        shots,
      }).success,
    ).toBe(true);
    expect(
      storyboardPlanSchema.safeParse({
        ...plan,
        runtimeBudgetSeconds: 60,
        shots: [...shots, { ...shots[0], ordinal: 13 }],
      }).success,
    ).toBe(false);
    shots[1].id = shots[0].id;
    expect(
      storyboardPlanSchema.safeParse({
        ...plan,
        runtimeBudgetSeconds: 60,
        shots,
      }).success,
    ).toBe(false);
  });
  it('refuses an over-budget draft or a final interpolation transition', () => {
    const shot = {
      id: 'shot-1',
      ordinal: 1,
      action: 'Action',
      onScreenSpeaker: false,
      durationSeconds: 10,
      stillFreshness: 'missing',
      transition: 'cut',
    };
    expect(
      storyboardPlanSchema.safeParse({
        ...plan,
        runtimeBudgetSeconds: 5,
        shots: [shot],
      }).success,
    ).toBe(false);
    expect(
      storyboardPlanSchema.safeParse({
        ...plan,
        shots: [{ ...shot, transition: 'interpolate' }],
      }).success,
    ).toBe(false);
  });
  it('requires shot and repair stage only for the corresponding operations', () => {
    expect(
      createStoryboardRunQuoteSchema.safeParse({
        expectedRevision: 1,
        operation: 'repair',
        shotId: 'shot-1',
        repairStage: 'image',
      }).success,
    ).toBe(true);
    for (const input of [
      { operation: 'repair', shotId: 'shot-1' },
      { operation: 'still' },
      { operation: 'video', shotId: 'shot-1' },
      { operation: 'plan', repairStage: 'image' },
    ])
      expect(
        createStoryboardRunQuoteSchema.safeParse({
          expectedRevision: 1,
          ...input,
        }).success,
      ).toBe(false);
  });
  it('upload snapshots require bounded measured media and carry no social metadata', () => {
    const upload = {
      selector: { kind: 'uploaded_video', assetId: 'video-1' },
      assetId: 'video-1',
      capturedAt: '2026-09-30T12:00:00.000Z',
      assetUpdatedAt: '2026-09-30T12:00:00.000Z',
      title: 'My video',
      durationSeconds: 60,
      sizeBytes: 104_857_600,
    };
    expect(storyboardSourceSnapshotSchema.safeParse(upload).success).toBe(true);
    for (const patch of [
      { durationSeconds: 61 },
      { sizeBytes: 104_857_601 },
      { platform: 'youtube' },
      { assetId: 'other' },
    ])
      expect(
        storyboardSourceSnapshotSchema.safeParse({ ...upload, ...patch })
          .success,
      ).toBe(false);
  });
  it('rejects an approval for a prior revision', () => {
    const config = {
      contract: 'storyboard-run',
      version: 1,
      revision: 2,
      approvedRevision: 1,
      clientRequestId: requestId,
      createdByUserId: 'user-1',
      submittedInputHash: 'a'.repeat(64),
      state: 'approved',
      sourceSnapshot: {
        selector: { kind: 'brief', brief: 'Make a video' },
        capturedAt: '2026-09-30T12:00:00.000Z',
      },
      plan,
    };
    expect(storyboardRunConfigSchema.safeParse(config).success).toBe(false);
  });
  it('preserves imported 4:5 while keeping new native intent formats unchanged', () => {
    expect(
      storyboardImportedPlanSchema.safeParse({ ...plan, format: '4:5' })
        .success,
    ).toBe(true);
    expect(
      storyboardPlanSchema.safeParse({ ...plan, format: '4:5' }).success,
    ).toBe(false);
    expect(
      createStoryboardRunSchema.safeParse({
        clientRequestId: requestId,
        source: { kind: 'brief', brief: 'Product' },
        planSettings: {
          format: '4:5',
          runtimeBudgetSeconds: null,
          styleReferenceAssetIds: [],
          cast: [],
        },
      }).success,
    ).toBe(false);
  });
});
