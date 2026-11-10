import {
  storyboardPublicConfig,
  storyboardStoredRunConfigSchema,
} from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import { StoryboardShotQaService } from '@api/collections/content-runs/services/storyboard-shot-qa.service';
import type { StoryboardNativeRunConfig } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const PROBE = JSON.stringify({
  streams: [{ codec_type: 'video', width: 1080, height: 1920 }],
  format: { duration: '6.0' },
});

function finalRender(operationId: string, assetId: string) {
  return {
    version: 1 as const,
    operationId,
    shotId: 'shot-1',
    stage: 'final' as const,
    actorUserId: 'user-1',
    modelKey: 'acme/cine-2',
    credits: 20,
    billingMode: 'platform' as const,
    inputFingerprint: 'a'.repeat(64),
    prompt: 'Mia checks the clock.',
    referenceAssetIds: ['still-1'],
    aspectRatio: '9:16',
    durationSeconds: 6,
    isAudioEnabled: true,
    createdAt: '2026-11-07T12:00:00.000Z',
    updatedAt: '2026-11-07T12:00:00.000Z',
    state: 'ready' as const,
    assetId,
    billing: 'settled' as const,
  };
}

function config(): StoryboardNativeRunConfig & Record<string, unknown> {
  return {
    origin: 'native',
    contract: 'storyboard-run',
    version: 1,
    revision: 4,
    approvedRevision: 4,
    state: 'approved',
    clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
    createdByUserId: 'user-1',
    submittedInputHash: 'a'.repeat(64),
    sourceSnapshot: {
      selector: { kind: 'brief', brief: 'Mia is late.' },
      capturedAt: '2026-11-07T12:00:00.000Z',
    },
    plan: {
      videoModelKey: 'acme/cine-2',
      title: 'Late',
      logline: '',
      format: '9:16',
      runtimeBudgetSeconds: 12,
      styleReferenceAssetIds: [],
      cast: [{ id: 'mia', name: 'Mia', referenceAssetIds: [] }],
      assetBible: [
        {
          id: 'mia-face',
          kind: 'character_face',
          label: 'Mia face',
          castMemberId: 'mia',
          sourceAssetIds: ['photo-1'],
          variantAssetIds: [],
          chosenAssetId: 'photo-1',
        },
      ],
      shots: [
        {
          id: 'shot-1',
          ordinal: 1,
          action: 'Mia checks the clock.',
          onScreenSpeaker: false,
          durationSeconds: 6,
          stillAssetId: 'still-1',
          stillFreshness: 'fresh',
          transition: 'cut',
        },
      ],
    },
    shotRenderOperations: [
      finalRender('0b8a5f0e-3f7c-4c1a-9a51-2f0b2b0f0a01', 'clip-1'),
    ],
  };
}

function setup(detectLog: string) {
  let stored: unknown = config();
  const store = {
    read: vi.fn(async () => ({
      record: {
        id: 'run-1',
        brandId: 'brand-1',
        organizationId: 'org-1',
        createdAt: new Date('2026-11-07T12:00:00.000Z'),
        updatedAt: new Date('2026-11-07T12:00:00.000Z'),
        config: structuredClone(stored),
      },
      config: storyboardStoredRunConfigSchema.parse(structuredClone(stored)),
    })),
    save: vi.fn(async (_org, _brand, _run, previous, next) => {
      if (
        JSON.stringify(storyboardStoredRunConfigSchema.parse(stored)) !==
        JSON.stringify(previous)
      )
        throw new ConflictException('Changed');
      stored = structuredClone(next);
      return {
        id: 'run-1',
        config: storyboardPublicConfig(
          storyboardStoredRunConfigSchema.parse(next),
        ),
      };
    }),
  };
  const prisma = {
    ingredient: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ id, cdnUrl: `https://cdn.test/${id}` })),
      ),
    },
  };
  const files = {
    inspectVideoQa: vi.fn(async () => ({
      probeJson: PROBE,
      detectLog,
      loudnessLog: null,
      decodeOk: true,
      contactSheetUrl: 'https://cdn.test/sheet.jpg',
    })),
  };
  const drift = {
    confidence: 0.8,
    summary: 'Her hair is shorter than in the reference.',
    verdict: 'drift',
  };
  const fine = { confidence: 0.9, summary: '', verdict: 'consistent' };
  const continuity = {
    resolve: vi.fn(async (_input: Record<string, unknown>) => ({
      finding: { character: drift, outfit: fine, product: fine },
    })),
  };
  const service = new StoryboardShotQaService(
    prisma as never,
    store as never,
    files as never,
    continuity as never,
    { error: vi.fn() } as never,
  );
  const shotRender = () =>
    storyboardPublicConfig(storyboardStoredRunConfigSchema.parse(stored))
      .shotRenders?.[0];
  return { service, files, continuity, shotRender };
}

describe('StoryboardShotQaService', () => {
  it('fails a final that goes black and flags continuity drift against the asset bible', async () => {
    const context = setup('black_start:1.5 black_end:2.5 black_duration:1');
    await context.service.check('org-1', 'brand-1', 'run-1');
    expect(context.shotRender()?.qa).toMatchObject({
      state: 'failed',
      failures: [
        {
          code: 'BLACK_FRAMES',
          message: 'Black-frame segment 1.50s–2.50s',
          timestamp: 1.5,
        },
      ],
      continuity: {
        state: 'flagged',
        notes: ['Her hair is shorter than in the reference.'],
      },
    });
    expect(context.continuity.resolve.mock.calls[0]?.[0]).toMatchObject({
      characterReferenceUrls: ['https://cdn.test/photo-1'],
      videoUrl: 'https://cdn.test/clip-1',
    });
  });

  it('passes a clean final and never checks it twice', async () => {
    const context = setup('');
    await context.service.check('org-1', 'brand-1', 'run-1');
    await context.service.check('org-1', 'brand-1', 'run-1');
    expect(context.shotRender()?.qa?.state).toBe('passed');
    expect(context.files.inspectVideoQa.mock.calls).toHaveLength(1);
  });

  it('leaves a final unchecked, not blocked, when inspection cannot run', async () => {
    const context = setup('');
    context.files.inspectVideoQa.mockRejectedValueOnce(new Error('down'));
    await context.service.check('org-1', 'brand-1', 'run-1');
    expect(context.shotRender()?.qa).toMatchObject({
      state: 'unavailable',
      failures: [],
    });
  });
});
