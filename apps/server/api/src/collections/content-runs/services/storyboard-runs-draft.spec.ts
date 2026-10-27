import { StoryboardPlanDraftService } from '@api/collections/content-runs/services/storyboard-plan-draft.service';
import { StoryboardRunsService } from '@api/collections/content-runs/services/storyboard-runs.service';
import type { StoryboardNativeRunConfig } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { StoryboardRunCapabilities } from '@genfeedai/contracts/api-types/contracts/storyboard-run-capabilities.contract';
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

function emptyConfig(): StoryboardNativeRunConfig {
  return {
    origin: 'native',
    contract: 'storyboard-run',
    version: 1,
    revision: 3,
    state: 'storyboard',
    clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
    createdByUserId: 'user-1',
    submittedInputHash: 'a'.repeat(64),
    sourceSnapshot: {
      selector: { kind: 'brief', brief: 'Launch the new bottle.' },
      capturedAt: '2026-09-30T12:00:00.000Z',
    },
    plan: {
      videoModelKey: null,
      title: '',
      logline: '',
      format: '9:16',
      runtimeBudgetSeconds: null,
      cast: [],
      styleReferenceAssetIds: [],
      shots: [],
    },
  };
}

function shotJson(index: number, overrides: Record<string, unknown> = {}) {
  return {
    existingShotId: null,
    sectionLabel: `Shot ${index}`,
    action: `Action ${index}`,
    dialogue: null,
    speakerId: null,
    isSpokenOnScreen: false,
    durationSeconds: 5,
    ...overrides,
  };
}

function setup(config: StoryboardNativeRunConfig = emptyConfig()) {
  const capability: StoryboardRunCapabilities = {
    version: 1,
    runId: 'run-1',
    runRevision: config.revision,
    capabilityVersion: 'b'.repeat(64),
    status: 'available',
    requestedModelKey: null,
    reasonCode: null,
    eligibleModels: [],
    effectiveModel: {
      key: 'custom/video',
      label: 'Custom',
      provider: 'replicate',
      supportedDurationsSeconds: [4, 6, 8],
      defaultDurationSeconds: 4,
      hasInterpolation: false,
      supportedFormats: ['9:16'],
      capabilitySource: 'catalog',
    },
  };
  const store = {
    read: vi.fn(async (_org, _brand, _run, expectedRevision?: number) => {
      if (
        expectedRevision !== undefined &&
        expectedRevision !== config.revision
      )
        throw new ConflictException(
          `Expected revision ${expectedRevision}; current revision is ${config.revision}. Reload before retrying.`,
        );
      return { config };
    }),
    save: vi.fn(async (_org, _brand, _run, _old, next) => next),
  };
  const chatCompletion = vi.fn();
  const logger = { error: vi.fn(), warn: vi.fn() };
  const source = { validatePlanAssets: vi.fn(async () => undefined) };
  const planning = {
    resolveBrandContext: vi.fn(async () => ({
      brand: { label: 'Acme', description: null },
    })),
  };
  const capabilities = { resolve: vi.fn(async () => capability) };
  const service = new StoryboardRunsService(
    {} as never,
    planning as never,
    source as never,
    store as never,
    capabilities as never,
    logger as never,
    new StoryboardPlanDraftService(
      { chatCompletion } as never,
      logger as never,
    ),
  );
  const reply = (content: unknown) =>
    chatCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(content) } }],
    });
  return { service, store, chatCompletion, reply, planning, source, config };
}

describe('Storyboard plan drafting', () => {
  it('drafts from the brief, fits the default budget and saves a reset point', async () => {
    const { service, store, reply, chatCompletion } = setup();
    reply({
      title: 'Bottle launch',
      logline: 'A bottle changes the day.',
      shots: [shotJson(1), shotJson(2), shotJson(3)],
    });
    const run = (await service.draftPlan('org-1', 'brand-1', 'run-1', {
      expectedRevision: 3,
    })) as unknown as StoryboardNativeRunConfig;
    expect(run).toMatchObject({ revision: 4, state: 'storyboard' });
    expect(run.plan.title).toBe('Bottle launch');
    expect(run.plan.runtimeBudgetSeconds).toBe(30);
    expect(run.plan.shots.map((shot) => shot.ordinal)).toEqual([1, 2, 3]);
    expect(
      run.plan.shots.every((shot) => shot.stillFreshness === 'missing'),
    ).toBe(true);
    expect(run.generatedPlan).toEqual(run.plan);
    expect(store.save).toHaveBeenCalledTimes(1);
    const prompt = chatCompletion.mock.calls[0][0].messages[1].content;
    expect(prompt).toContain('Launch the new bottle.');
  });

  it('snaps durations to the model and keeps the total inside the budget', async () => {
    const config = emptyConfig();
    config.plan.runtimeBudgetSeconds = 12;
    const { service, reply } = setup(config);
    reply({
      title: 'T',
      logline: '',
      shots: [
        shotJson(1, { durationSeconds: 7.4 }),
        shotJson(2, { durationSeconds: 9 }),
        shotJson(3, { durationSeconds: 5 }),
      ],
    });
    const run = (await service.draftPlan('org-1', 'brand-1', 'run-1', {
      expectedRevision: 3,
    })) as unknown as StoryboardNativeRunConfig;
    const durations = run.plan.shots.map((shot) => shot.durationSeconds ?? 0);
    expect(durations.every((value) => [4, 6, 8].includes(value))).toBe(true);
    expect(
      durations.reduce((sum, value) => sum + value, 0),
    ).toBeLessThanOrEqual(12);
    expect(run.plan.runtimeBudgetSeconds).toBe(12);
  });

  it('revises through the edit rules and keeps the earlier reset point', async () => {
    const config = emptyConfig();
    config.plan.title = 'Old';
    config.generatedPlan = structuredClone(config.plan);
    config.plan.runtimeBudgetSeconds = 12;
    config.plan.shots = [1, 2].map((ordinal) => ({
      id: `shot-${ordinal}`,
      ordinal,
      action: `Action ${ordinal}`,
      onScreenSpeaker: false,
      durationSeconds: 4,
      stillFreshness: 'fresh' as const,
      stillAssetId: `image-${ordinal}`,
      transition: 'cut' as const,
    }));
    const { service, reply, chatCompletion } = setup(config);
    reply({
      title: 'New title',
      logline: '',
      shots: [
        shotJson(1, { existingShotId: 'shot-1', action: 'Action 1' }),
        shotJson(2, { existingShotId: 'shot-2', action: 'Action 2 reworked' }),
      ],
    });
    const run = (await service.draftPlan('org-1', 'brand-1', 'run-1', {
      expectedRevision: 3,
      instruction: 'Make the second shot punchier',
    })) as unknown as StoryboardNativeRunConfig;
    expect(run.plan.shots[0]).toMatchObject({
      id: 'shot-1',
      stillAssetId: 'image-1',
      stillFreshness: 'fresh',
    });
    expect(run.plan.shots[1]).toMatchObject({
      id: 'shot-2',
      stillAssetId: 'image-2',
      stillFreshness: 'stale',
    });
    expect(run.generatedPlan?.title).toBe('Old');
    expect(chatCompletion.mock.calls[0][0].messages[1].content).toContain(
      'Make the second shot punchier',
    );
  });

  it('rejects a stale revision without calling the model', async () => {
    const { service, chatCompletion, store } = setup();
    await expect(
      service.draftPlan('org-1', 'brand-1', 'run-1', { expectedRevision: 2 }),
    ).rejects.toThrow('current revision is 3');
    expect(chatCompletion).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('refuses while accepted work is running', async () => {
    const config = emptyConfig();
    config.state = 'generating';
    const { service, chatCompletion } = setup(config);
    await expect(
      service.draftPlan('org-1', 'brand-1', 'run-1', { expectedRevision: 3 }),
    ).rejects.toThrow('Cancel and reconcile');
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('needs a written brief', async () => {
    const config = emptyConfig();
    config.sourceSnapshot = {
      selector: { kind: 'brief', brief: '', seedImageAssetId: 'image-1' },
      capturedAt: '2026-09-30T12:00:00.000Z',
    };
    const { service } = setup(config);
    await expect(
      service.draftPlan('org-1', 'brand-1', 'run-1', { expectedRevision: 3 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects video sources', async () => {
    const config = emptyConfig();
    config.sourceSnapshot = {
      selector: { kind: 'uploaded_video', assetId: 'video-1' },
      capturedAt: '2026-09-30T12:00:00.000Z',
      assetId: 'video-1',
      assetUpdatedAt: '2026-09-30T12:00:00.000Z',
      title: 'Clip',
      durationSeconds: 10,
      sizeBytes: 1000,
    };
    const { service } = setup(config);
    await expect(
      service.draftPlan('org-1', 'brand-1', 'run-1', { expectedRevision: 3 }),
    ).rejects.toThrow('written brief');
  });

  it.each([
    ['provider error', () => new Error('upstream 500')],
    ['invalid output', () => ({ title: '' })],
  ])('leaves the run unchanged on %s', async (_name, failure) => {
    const { service, store, chatCompletion, reply } = setup();
    const value = failure();
    if (value instanceof Error) chatCompletion.mockRejectedValueOnce(value);
    else reply(value);
    await expect(
      service.draftPlan('org-1', 'brand-1', 'run-1', { expectedRevision: 3 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(store.save).not.toHaveBeenCalled();
  });

  it('rejects unknown body fields', async () => {
    const { service } = setup();
    await expect(
      service.draftPlan('org-1', 'brand-1', 'run-1', {
        expectedRevision: 3,
        extra: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
