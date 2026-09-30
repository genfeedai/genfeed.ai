import type { StoryboardRunConfig } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { StoryboardRunCapabilities } from '@genfeedai/contracts/api-types/contracts/storyboard-run-capabilities.contract';
import { describe, expect, it, vi } from 'vitest';
import { StoryboardRunsService } from './storyboard-runs.service';

function setup() {
  const config: StoryboardRunConfig = {
    contract: 'storyboard-run',
    version: 1,
    revision: 1,
    state: 'storyboard',
    clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
    createdByUserId: 'user-1',
    submittedInputHash: 'a'.repeat(64),
    sourceSnapshot: {
      selector: { kind: 'brief', brief: 'A product' },
      capturedAt: '2026-09-30T12:00:00.000Z',
    },
    plan: {
      videoModelKey: null,
      title: '',
      logline: '',
      format: '9:16',
      runtimeBudgetSeconds: 12,
      cast: [],
      styleReferenceAssetIds: [],
      shots: [1, 2].map((ordinal) => ({
        id: `shot-${ordinal}`,
        ordinal,
        action: 'Action',
        onScreenSpeaker: false,
        durationSeconds: 5,
        stillFreshness: 'fresh',
        stillAssetId: `image-${ordinal}`,
        transition: 'cut',
      })),
    },
  };
  const capability: StoryboardRunCapabilities = {
    version: 1,
    runId: 'run-1',
    runRevision: 1,
    capabilityVersion: 'a'.repeat(64),
    status: 'available',
    requestedModelKey: null,
    reasonCode: null,
    eligibleModels: [],
    effectiveModel: {
      key: 'custom/video',
      label: 'Custom',
      provider: 'replicate',
      supportedDurationsSeconds: [4, 6],
      defaultDurationSeconds: 4,
      hasInterpolation: false,
      supportedFormats: ['9:16'],
      capabilitySource: 'catalog',
    },
  };
  const store = {
    read: vi.fn(async () => ({ config })),
    save: vi.fn(async (_org, _brand, _run, _old, next) => next),
  };
  const source = { validatePlanAssets: vi.fn(async () => undefined) };
  const capabilities = { resolve: vi.fn(async () => capability) };
  const service = new StoryboardRunsService(
    {} as never,
    {} as never,
    source as never,
    store as never,
    capabilities as never,
  );
  return { service, store, config, capabilities, capability, source };
}

describe('Storyboard capabilities at the durable edit boundary', () => {
  it('revalidates restored generated timing instead of bypassing model capabilities', async () => {
    const { service, config, store, capability } = setup();
    config.generatedPlan = {
      ...structuredClone(config.plan),
      videoModelKey: 'custom/video',
    };
    capability.status = 'unavailable';
    capability.effectiveModel = null;
    capability.reasonCode = 'MODEL_DISABLED';
    await expect(
      service.resetPlan('org-1', 'brand-1', 'run-1', { expectedRevision: 1 }),
    ).rejects.toThrow('MODEL_DISABLED');
    expect(store.save).not.toHaveBeenCalled();
  });

  it('rejects missing and stale acknowledgements before any durable write', async () => {
    const { service, config, store } = setup();
    const plan = structuredClone(config.plan);
    plan.shots[0].durationSeconds = 6;
    await expect(
      service.updatePlan('org-1', 'brand-1', 'run-1', {
        expectedRevision: 1,
        plan,
      }),
    ).rejects.toThrow('STORYBOARD_CAPABILITIES_REQUIRED');
    await expect(
      service.updatePlan('org-1', 'brand-1', 'run-1', {
        expectedRevision: 1,
        plan,
        capabilityVersion: 'b'.repeat(64),
      }),
    ).rejects.toThrow('STORYBOARD_CAPABILITIES_CHANGED');
    expect(store.save).not.toHaveBeenCalled();
  });
  it('atomically rejects an over-budget snapped model change', async () => {
    const { service, config, store } = setup();
    const plan = {
      ...structuredClone(config.plan),
      videoModelKey: 'custom/video',
      runtimeBudgetSeconds: 7,
    };
    await expect(
      service.updatePlan('org-1', 'brand-1', 'run-1', {
        expectedRevision: 1,
        plan,
        capabilityVersion: 'a'.repeat(64),
      }),
    ).rejects.toThrow('STORYBOARD_RUNTIME_EXCEEDED');
    expect(store.save).not.toHaveBeenCalled();
    expect(config.plan.shots.map((shot) => shot.durationSeconds)).toEqual([
      5, 5,
    ]);
  });
  it('saves all normalized durations with the existing scoped revision CAS', async () => {
    const { service, config, store } = setup();
    const plan = {
      ...structuredClone(config.plan),
      videoModelKey: 'custom/video',
    };
    await service.updatePlan('org-1', 'brand-1', 'run-1', {
      expectedRevision: 1,
      plan,
      capabilityVersion: 'a'.repeat(64),
    });
    expect(store.save).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'run-1',
      config,
      expect.objectContaining({
        revision: 2,
        plan: expect.objectContaining({
          videoModelKey: 'custom/video',
          shots: expect.arrayContaining([
            expect.objectContaining({ id: 'shot-1', durationSeconds: 4 }),
            expect.objectContaining({ id: 'shot-2', durationSeconds: 4 }),
          ]),
        }),
      }),
    );
  });
  it('allows draft notes when models are unavailable and blocks timing', async () => {
    const { service, config, store, capability } = setup();
    capability.status = 'unavailable';
    capability.reasonCode = 'MODEL_DISABLED';
    capability.effectiveModel = null;
    const plan = structuredClone(config.plan);
    plan.shots[0].notes = 'Private';
    await service.updatePlan('org-1', 'brand-1', 'run-1', {
      expectedRevision: 1,
      plan,
    });
    expect(store.save).toHaveBeenCalledTimes(1);
    plan.shots[0].durationSeconds = 6;
    await expect(
      service.updatePlan('org-1', 'brand-1', 'run-1', {
        expectedRevision: 1,
        plan,
        capabilityVersion: 'a'.repeat(64),
      }),
    ).rejects.toThrow('MODEL_DISABLED');
    expect(store.save).toHaveBeenCalledTimes(1);
  });
});
