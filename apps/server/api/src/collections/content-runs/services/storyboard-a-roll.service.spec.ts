import { StoryboardARollService } from '@api/collections/content-runs/services/storyboard-a-roll.service';
import { storyboardStoredRunConfigSchema } from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import type { StoryboardNativeRunConfig } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nestjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nestjs')>()),
  captureException: vi.fn(),
}));

const SENTENCE = `${'word '.repeat(59)}end.`; // 299 characters

function approvedConfig(sentences = 8): StoryboardNativeRunConfig {
  return {
    origin: 'native',
    contract: 'storyboard-run',
    version: 1,
    revision: 3,
    approvedRevision: 3,
    state: 'approved',
    clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
    createdByUserId: 'user-1',
    submittedInputHash: 'a'.repeat(64),
    sourceSnapshot: {
      selector: { kind: 'brief', brief: 'Pricing', length: 'long_form' },
      capturedAt: '2026-10-26T12:00:00.000Z',
    },
    plan: {
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
        segments: Array.from(
          { length: Math.ceil(sentences / 4) },
          (_, index) => ({
            id: `segment-${index + 1}`,
            ordinal: index + 1,
            narration: Array.from(
              { length: Math.min(4, sentences - index * 4) },
              () => SENTENCE,
            ).join(' '),
            estimatedSeconds: 100,
            cutaways: [],
          }),
        ),
      },
    },
  };
}

function setup(initial: StoryboardNativeRunConfig = approvedConfig()) {
  let stored: unknown = structuredClone(initial);
  const record = () => ({
    id: 'run-1',
    brandId: 'brand-1',
    organizationId: 'org-1',
    createdAt: new Date('2026-10-26T12:00:00.000Z'),
    updatedAt: new Date('2026-10-26T12:00:00.000Z'),
    config: structuredClone(stored),
  });
  const store = {
    read: vi.fn(
      async (_org: string, _brand: string, _run: string, expected?: number) => {
        const config = storyboardStoredRunConfigSchema.parse(
          structuredClone(stored),
        );
        if (expected !== undefined && expected !== config.revision)
          throw new ConflictException('Expected revision');
        return { record: record(), config };
      },
    ),
    save: vi.fn(async (_org, _brand, _run, _previous, next) => {
      stored = structuredClone(next);
      return {
        id: 'run-1',
        config: storyboardStoredRunConfigSchema.parse(next),
      };
    }),
  };
  const ingredients = new Map<
    string,
    { status: string; metadata?: { duration: number } | null }
  >();
  const prisma = {
    ingredient: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = ingredients.get(where.id);
        return row ? { metadata: null, ...row } : null;
      }),
    },
  };
  let rendered = 0;
  const avatars = {
    quote: vi.fn(async (params: { text: string }) => ({
      billingMode: 'platform' as const,
      credits: params.text.length,
      estimatedSeconds: Math.ceil(params.text.length / 12),
      modelKey: MODEL_KEYS.HEYGEN_AVATAR,
    })),
    generateAvatarVideo: vi.fn(
      async (
        _params: unknown,
        _context: unknown,
        onPlaceholderCreated: (id: string) => Promise<void>,
      ) => {
        rendered += 1;
        const id = `asset-${rendered}`;
        ingredients.set(id, { status: 'PROCESSING' });
        await onPlaceholderCreated(id);
        return {
          ingredientId: id,
          externalId: `job-${rendered}`,
          status: 'processing',
        };
      },
    ),
  };
  let spoken = 0;
  const voice = {
    resolve: vi.fn(async () => ({
      externalVoiceId: 'eleven-1',
      provider: 'elevenlabs',
      modelKey: 'elevenlabs/eleven_flash_v2_5',
    })),
    quote: vi.fn(async (_org: string, _voice: unknown, text: string) => ({
      billingMode: 'platform' as const,
      credits: Math.ceil(text.length / 100),
      estimatedSeconds: Math.ceil(text.length / 12),
      modelKey: 'elevenlabs/eleven_flash_v2_5',
    })),
    speak: vi.fn(async () => {
      spoken += 1;
      const id = `speech-${spoken}`;
      ingredients.set(id, { status: 'PROCESSING' });
      return id;
    }),
  };
  const logger = { error: vi.fn() };
  const service = new StoryboardARollService(
    prisma as never,
    store as never,
    avatars as never,
    voice as never,
    logger as never,
  );
  const config = () => storyboardStoredRunConfigSchema.parse(stored);
  return { service, store, avatars, voice, ingredients, config };
}

async function renderAll(ctx: ReturnType<typeof setup>) {
  const quote = await ctx.service.quote(
    'aRoll',
    'org-1',
    'brand-1',
    'run-1',
    'user-1',
    {
      expectedRevision: 3,
    },
  );
  await ctx.service.render('aRoll', 'org-1', 'brand-1', 'run-1', 'user-1', {
    expectedRevision: 3,
    inputHash: quote.inputHash,
  });
  return quote;
}

describe('StoryboardARollService', () => {
  it('quotes one avatar render per chunk of the narration', async () => {
    const ctx = setup();
    const quote = await ctx.service.quote(
      'aRoll',
      'org-1',
      'brand-1',
      'run-1',
      'user-1',
      {
        expectedRevision: 3,
      },
    );

    // Sentences of 299 characters fit five to a 1,500-character render.
    expect(quote.items.map((item) => item.characters)).toEqual([1_499, 899]);
    expect(quote.total).toBe(2_398);
    expect(ctx.avatars.quote).toHaveBeenCalledWith(
      expect.objectContaining({
        photoIngredientId: 'avatar-1',
        clonedVoiceId: 'voice-1',
        aspectRatio: '16:9',
        model: MODEL_KEYS.HEYGEN_AVATAR_IV,
      }),
      { organizationId: 'org-1', userId: 'user-1', brandId: 'brand-1' },
    );
  });

  it('refuses a plan that is not approved', async () => {
    const ctx = setup({
      ...approvedConfig(),
      state: 'storyboard',
      approvedRevision: undefined,
    });

    await expect(
      ctx.service.quote('aRoll', 'org-1', 'brand-1', 'run-1', 'user-1', {
        expectedRevision: 3,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('renders each chunk and records its measured length', async () => {
    const ctx = setup();
    await renderAll(ctx);

    expect(ctx.avatars.generateAvatarVideo).toHaveBeenCalledTimes(2);
    expect(ctx.config().aRoll?.chunks.map((chunk) => chunk.state)).toEqual([
      'submitted',
      'submitted',
    ]);

    ctx.ingredients.set('asset-1', {
      status: 'GENERATED',
      metadata: { duration: 98.5 },
    });
    ctx.ingredients.set('asset-2', { status: 'PROCESSING' });
    await ctx.service.reconcile('org-1', 'brand-1', 'run-1');

    expect(ctx.config().aRoll?.chunks).toMatchObject([
      { state: 'ready', assetId: 'asset-1', durationSeconds: 98.5 },
      { state: 'submitted', assetId: 'asset-2' },
    ]);
  });

  it('re-renders only the failed chunk', async () => {
    const ctx = setup();
    await renderAll(ctx);
    ctx.ingredients.set('asset-1', {
      status: 'GENERATED',
      metadata: { duration: 98 },
    });
    ctx.ingredients.set('asset-2', { status: 'FAILED' });
    await ctx.service.reconcile('org-1', 'brand-1', 'run-1');

    const retry = await renderAll(ctx);

    expect(retry.items).toHaveLength(1);
    expect(retry.items[0]?.ordinal).toBe(2);
    expect(retry.readyChunkIds).toEqual([ctx.config().aRoll?.chunks[0]?.id]);
    expect(ctx.avatars.generateAvatarVideo).toHaveBeenCalledTimes(3);
    expect(ctx.config().aRoll?.chunks).toMatchObject([
      { state: 'ready', assetId: 'asset-1' },
      { state: 'submitted', assetId: 'asset-3' },
    ]);
  });

  it('refuses a stale quote', async () => {
    const ctx = setup();
    await expect(
      ctx.service.render('aRoll', 'org-1', 'brand-1', 'run-1', 'user-1', {
        expectedRevision: 3,
        inputHash: 'b'.repeat(64),
      }),
    ).rejects.toThrow(ConflictException);
    expect(ctx.avatars.generateAvatarVideo).not.toHaveBeenCalled();
  });

  it('marks a chunk failed when its dispatch throws', async () => {
    const ctx = setup();
    ctx.avatars.generateAvatarVideo.mockRejectedValueOnce(new Error('down'));
    await renderAll(ctx);

    expect(ctx.config().aRoll?.chunks).toMatchObject([
      { state: 'failed', errorCode: 'STORYBOARD_A_ROLL_DISPATCH_FAILED' },
      { state: 'submitted' },
    ]);
  });

  it('has nothing to quote once every chunk is ready', async () => {
    const ctx = setup(approvedConfig(2));
    await renderAll(ctx);
    ctx.ingredients.set('asset-1', {
      status: 'GENERATED',
      metadata: { duration: 50 },
    });
    await ctx.service.reconcile('org-1', 'brand-1', 'run-1');

    await expect(
      ctx.service.quote('aRoll', 'org-1', 'brand-1', 'run-1', 'user-1', {
        expectedRevision: 3,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('drafts the animatic as speech before approval, without avatars', async () => {
    const ctx = setup({
      ...approvedConfig(),
      state: 'storyboard',
      approvedRevision: undefined,
    });
    const quote = await ctx.service.quote(
      'animatic',
      'org-1',
      'brand-1',
      'run-1',
      'user-1',
      { expectedRevision: 3 },
    );
    expect(quote.total).toBe(15 + 9);

    await ctx.service.render(
      'animatic',
      'org-1',
      'brand-1',
      'run-1',
      'user-1',
      {
        expectedRevision: 3,
        inputHash: quote.inputHash,
      },
    );

    expect(ctx.avatars.generateAvatarVideo).not.toHaveBeenCalled();
    expect(ctx.voice.speak).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('word'),
        sourceActionId: expect.stringMatching(/^storyboard-animatic-run-1-/),
      }),
    );
    expect(ctx.config().aRoll).toBeUndefined();
    expect(ctx.config().animatic?.chunks.map((chunk) => chunk.state)).toEqual([
      'submitted',
      'submitted',
    ]);

    ctx.ingredients.set('speech-1', {
      status: 'GENERATED',
      metadata: { duration: 120 },
    });
    await ctx.service.reconcile('org-1', 'brand-1', 'run-1');
    expect(ctx.config().animatic?.chunks[0]).toMatchObject({
      state: 'ready',
      durationSeconds: 120,
    });
  });
});
