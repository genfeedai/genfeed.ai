import { StoryboardReversePlanService } from '@api/collections/content-runs/services/storyboard-reverse-plan.service';
import type { StoryboardNativeRunConfig } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { StoryboardRunCapabilities } from '@genfeedai/contracts/api-types/contracts/storyboard-run-capabilities.contract';
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const style = {
  label: 'Warm studio, soft grain',
  palette: ['cream'],
  lighting: 'soft window light',
  lens: 'normal lens',
  grade: 'fine grain',
  typography: '',
};

function videoShot(index: number, startSeconds: number, endSeconds: number) {
  return {
    sectionLabel: `Take ${index}`,
    startSeconds,
    endSeconds,
    action: `Action ${index}`,
    cuts: [],
    sfx: [],
    referenceRoles: [],
    overlays: [],
    videoPrompt: `Prompt ${index}`,
  };
}

function config(
  overrides: Partial<StoryboardNativeRunConfig> = {},
): StoryboardNativeRunConfig {
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
    ...overrides,
  };
}

function setup(
  stored: StoryboardNativeRunConfig = config(),
  analyse = vi.fn(async () => ({
    kind: 'video' as const,
    runtimeBudgetSeconds: 30,
    analysis: {
      title: 'Bottle reverse',
      logline: '',
      style,
      shots: [videoShot(1, 0, 3.8), videoShot(2, 3.8, 10)],
    },
  })),
) {
  const capability: StoryboardRunCapabilities = {
    version: 1,
    runId: 'run-1',
    runRevision: stored.revision,
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
  const saved: StoryboardNativeRunConfig[] = [];
  const store = {
    read: vi.fn(
      async (_o: string, _b: string, _r: string, revision?: number) => {
        if (revision !== undefined && revision !== stored.revision)
          throw new ConflictException('Reload before retrying.');
        return { config: stored };
      },
    ),
    save: vi.fn(
      async (
        _o: string,
        _b: string,
        _r: string,
        _previous: unknown,
        next: StoryboardNativeRunConfig,
      ) => {
        saved.push(next);
        return { id: 'run-1', config: next };
      },
    ),
  };
  const service = new StoryboardReversePlanService(
    store as never,
    { resolve: vi.fn(async () => capability) } as never,
    { validatePlanAssets: vi.fn(async () => undefined) } as never,
    { analyse } as never,
  );
  const reverse = (
    body: unknown = { expectedRevision: 3, assetId: 'video-1' },
  ) => service.reverse('org-1', 'brand-1', 'run-1', body);
  return { reverse, saved, analyse };
}

describe('StoryboardReversePlanService', () => {
  it('replaces the shots with the reference and saves a reset point', async () => {
    const { reverse, saved } = setup();
    const { run, analysis } = await reverse();
    expect(run.config.plan.title).toBe('Bottle reverse');
    expect(
      saved[0].plan.shots.map((shot) => [
        shot.sectionLabel,
        shot.durationSeconds,
        shot.videoPrompt,
      ]),
    ).toEqual([
      ['Take 1', 4, 'Prompt 1'],
      ['Take 2', 6, 'Prompt 2'],
    ]);
    expect(saved[0].generatedPlan?.shots).toHaveLength(2);
    expect(analysis).toEqual({
      kind: 'video',
      overlays: [],
      style: 'Warm studio, soft grain',
    });
  });

  it('keeps the earlier generated plan when shots were already written', async () => {
    const written = config({
      plan: {
        ...config().plan,
        shots: [
          {
            id: 'shot-1',
            ordinal: 1,
            action: 'Mia checks the clock.',
            onScreenSpeaker: false,
            durationSeconds: 4,
            stillFreshness: 'missing',
            transition: 'cut',
          },
        ],
      },
    });
    const { reverse, saved } = setup(written);
    await reverse();
    expect(saved[0].generatedPlan).toBeUndefined();
    expect(saved[0].plan.shots.map((shot) => shot.sectionLabel)).toEqual([
      'Take 1',
      'Take 2',
    ]);
  });

  it('reports the text on screen it read from the reference', async () => {
    const analyse = vi.fn(async () => ({
      kind: 'image' as const,
      analysis: {
        title: 'Portrait',
        style,
        composition: 'Left third.',
        referenceRoles: [],
        overlays: [
          {
            text: 'NEW',
            startSeconds: null,
            endSeconds: null,
            position: '',
            arrival: '',
          },
        ],
        prompt: 'A golden-hour portrait.',
      },
    }));
    const { reverse, saved } = setup(config(), analyse as never);
    const { analysis } = await reverse({
      expectedRevision: 3,
      assetId: 'image-1',
    });
    expect(analysis).toEqual({
      kind: 'image',
      overlays: ['NEW'],
      style: 'Warm studio, soft grain',
    });
    expect(saved[0].plan.styleReferenceAssetIds).toEqual(['image-1']);
    expect(saved[0].plan.shots[0].action).toBe('A golden-hour portrait.');
  });

  it.each([
    [
      'a storyboard that starts from a video',
      config({
        state: 'awaiting_analysis',
        sourceSnapshot: {
          selector: { kind: 'uploaded_video', assetId: 'video-0' },
          capturedAt: '2026-09-30T12:00:00.000Z',
          assetId: 'video-0',
          assetUpdatedAt: '2026-09-30T12:00:00.000Z',
          title: '',
          durationSeconds: 10,
          sizeBytes: 100,
        },
      }),
    ],
    ['a slideshow', config({ plan: { ...config().plan, kind: 'slideshow' } })],
  ])('refuses %s and writes nothing', async (_name, stored) => {
    const { reverse, saved, analyse } = setup(stored);
    await expect(reverse()).rejects.toBeInstanceOf(BadRequestException);
    expect(saved).toEqual([]);
    expect(analyse).not.toHaveBeenCalled();
  });

  it('refuses a body without an asset', async () => {
    const { reverse } = setup();
    await expect(reverse({ expectedRevision: 3 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses a stale revision', async () => {
    const { reverse, saved } = setup();
    await expect(
      reverse({ expectedRevision: 2, assetId: 'video-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(saved).toEqual([]);
  });

  it('leaves the run untouched when the analysis fails', async () => {
    const { reverse, saved } = setup(
      config(),
      vi.fn(async () => {
        throw new ServiceUnavailableException('try again');
      }) as never,
    );
    await expect(reverse()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(saved).toEqual([]);
  });

  it('answers a retryable error when the analysis has more shots than fit', async () => {
    const analyse = vi.fn(async () => ({
      kind: 'video' as const,
      runtimeBudgetSeconds: 8,
      analysis: {
        title: 'Too long',
        logline: '',
        style,
        shots: [videoShot(1, 0, 3), videoShot(2, 3, 6), videoShot(3, 6, 9)],
      },
    }));
    const { reverse, saved } = setup(config(), analyse as never);
    await expect(reverse()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(saved).toEqual([]);
  });
});
