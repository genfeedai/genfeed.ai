import { storyboardStoredRunConfigSchema } from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import { StoryboardStillsService } from '@api/collections/content-runs/services/storyboard-stills.service';
import { UnsettleableReservationException } from '@api/exceptions/business-logic.exception';
import type { StoryboardNativeRunConfig } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { DRAFT_GENERATION_CONFIG } from '@genfeedai/contracts/constants';
import { BadRequestException, ConflictException } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nestjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nestjs')>()),
  captureException: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(Sentry.captureException).mockClear();
});

const KLEIN = DRAFT_GENERATION_CONFIG.draftModelKey;

function draftConfig(): StoryboardNativeRunConfig {
  return {
    origin: 'native',
    contract: 'storyboard-run',
    version: 1,
    revision: 4,
    state: 'storyboard',
    clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
    createdByUserId: 'user-1',
    submittedInputHash: 'a'.repeat(64),
    sourceSnapshot: {
      selector: { kind: 'brief', brief: 'Launch the new bottle.' },
      capturedAt: '2026-10-14T12:00:00.000Z',
    },
    plan: {
      videoModelKey: null,
      title: 'Launch',
      logline: '',
      format: '9:16',
      runtimeBudgetSeconds: 20,
      styleReferenceAssetIds: ['style-1', 'style-2', 'style-3', 'style-4'],
      cast: [
        {
          id: 'cast-mia',
          name: 'Mia',
          avatarAssetId: 'avatar-mia',
          referenceAssetIds: ['mia-1', 'mia-2'],
        },
        { id: 'cast-leo', name: 'Leo', referenceAssetIds: ['leo-1'] },
      ],
      shots: [
        {
          id: 'shot-1',
          ordinal: 1,
          action: 'Mia opens the cafe door while Leo waves.',
          speakerId: 'cast-mia',
          onScreenSpeaker: true,
          durationSeconds: 5,
          stillFreshness: 'missing',
          transition: 'cut',
        },
        {
          id: 'shot-2',
          ordinal: 2,
          action: 'Close-up of the bottle on the counter.',
          onScreenSpeaker: false,
          durationSeconds: 5,
          stillAssetId: 'old-still',
          stillFreshness: 'stale',
          transition: 'cut',
        },
        {
          id: 'shot-3',
          ordinal: 3,
          action: 'The logo fades in.',
          onScreenSpeaker: false,
          durationSeconds: 5,
          stillAssetId: 'fresh-still',
          stillFreshness: 'fresh',
          transition: 'cut',
        },
      ],
    },
  };
}

function setup(initial: StoryboardNativeRunConfig = draftConfig()) {
  let stored: unknown = structuredClone(initial);
  const record = () => ({
    id: 'run-1',
    brandId: 'brand-1',
    organizationId: 'org-1',
    createdAt: new Date('2026-10-14T12:00:00.000Z'),
    updatedAt: new Date('2026-10-14T12:00:00.000Z'),
    config: structuredClone(stored),
  });
  const store = {
    read: vi.fn(
      async (
        _org: string,
        _brand: string,
        runId: string,
        expected?: number,
      ) => {
        if (runId !== 'run-1') throw new Error('Unknown run');
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
    { status: string; metadata?: Record<string, string> | null }
  >();
  const prisma = {
    ingredient: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = ingredients.get(where.id);
        return row ? { id: where.id, metadata: null, ...row } : null;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { status: string };
        }) => {
          const row = ingredients.get(where.id);
          if (row) row.status = data.status;
          return { count: row ? 1 : 0 };
        },
      ),
    },
  };
  const estimate = {
    estimate: vi.fn(async () => ({
      isAvailable: true,
      credits: 4,
      modelKey: KLEIN,
    })),
  };
  const byok = { isByokActiveForProvider: vi.fn(async () => false) };
  let dispatched = 0;
  const images = {
    generateImage: vi.fn(
      async (
        _user: unknown,
        _dto: unknown,
        request: { creditsConfig?: Record<string, unknown> },
        onPlaceholderCreated: (id: string) => Promise<void>,
        _scope: unknown,
        onCreditsPrepared: () => Promise<void>,
      ) => {
        dispatched += 1;
        const id = `asset-${dispatched}`;
        ingredients.set(id, { status: 'PROCESSING' });
        await onPlaceholderCreated(id);
        request.creditsConfig = {
          deferred: true,
          amount: 4,
          reservationId: `res-${dispatched}`,
        };
        await onCreditsPrepared();
        return { data: { id } };
      },
    ),
  };
  const credits = {
    settleReservation: vi.fn(async () => ({})),
    releaseReservation: vi.fn(async () => ({})),
  };
  const source = { validatePlanAssets: vi.fn(async () => undefined) };
  const logger = { warn: vi.fn(), error: vi.fn() };
  const service = new StoryboardStillsService(
    prisma as never,
    store as never,
    source as never,
    estimate as never,
    byok as never,
    images as never,
    credits as never,
    logger as never,
  );
  const current = () => storyboardStoredRunConfigSchema.parse(stored);
  const edit = (change: (config: StoryboardNativeRunConfig) => void) => {
    const next = structuredClone(stored) as StoryboardNativeRunConfig;
    change(next);
    stored = next;
  };
  return {
    service,
    store,
    prisma,
    images,
    credits,
    estimate,
    byok,
    ingredients,
    current,
    edit,
  };
}

async function quoteAndGenerate(
  context: ReturnType<typeof setup>,
  shotIds?: string[],
) {
  const quote = await context.service.quote('org-1', 'brand-1', 'run-1', {
    expectedRevision: 4,
    ...(shotIds ? { shotIds } : {}),
  });
  await context.service.generate('org-1', 'brand-1', 'run-1', 'user-1', {
    expectedRevision: 4,
    shotIds: quote.items.map((item) => item.shotId),
    inputHash: quote.inputHash,
  });
  return quote;
}

describe('StoryboardStillsService quote', () => {
  it('quotes every shot without a fresh still at the catalog price', async () => {
    const { service, estimate } = setup();
    const quote = await service.quote('org-1', 'brand-1', 'run-1', {
      expectedRevision: 4,
    });
    expect(quote).toMatchObject({
      revision: 4,
      modelKey: KLEIN,
      billingMode: 'platform',
      items: [
        { shotId: 'shot-1', credits: 4 },
        { shotId: 'shot-2', credits: 4 },
      ],
      total: 8,
    });
    expect(estimate.estimate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        category: 'image',
        modelKey: KLEIN,
        outputs: 1,
      }),
    );
  });

  it('quotes a named fresh shot for regeneration and charges BYOK nothing', async () => {
    const { service, byok } = setup();
    byok.isByokActiveForProvider.mockResolvedValueOnce(true);
    const quote = await service.quote('org-1', 'brand-1', 'run-1', {
      expectedRevision: 4,
      shotIds: ['shot-3'],
    });
    expect(quote).toMatchObject({
      billingMode: 'byok',
      items: [{ shotId: 'shot-3', credits: 0 }],
      total: 0,
    });
  });

  it('refuses shots without an action, approved boards and an unpriced model', async () => {
    const empty = setup();
    empty.edit((config) => {
      config.plan.shots[0].action = '';
    });
    await expect(
      empty.service.quote('org-1', 'brand-1', 'run-1', {
        expectedRevision: 4,
        shotIds: ['shot-1'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const approved = setup({ ...draftConfig(), state: 'approved' });
    await expect(
      approved.service.quote('org-1', 'brand-1', 'run-1', {
        expectedRevision: 4,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const unpriced = setup();
    unpriced.estimate.estimate.mockResolvedValueOnce({
      isAvailable: false,
      credits: null,
      modelKey: null,
    } as never);
    await expect(
      unpriced.service.quote('org-1', 'brand-1', 'run-1', {
        expectedRevision: 4,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('StoryboardStillsService generate', () => {
  it('sends a klein sketch prompt with cast first and marks shots generating', async () => {
    const context = setup();
    await quoteAndGenerate(context, ['shot-1']);
    const [, dto, , , scope] = context.images.generateImage.mock.calls[0];
    expect(dto).toMatchObject({
      brandId: 'brand-1',
      model: KLEIN,
      autoSelectModel: false,
      aspectRatio: '9:16',
      resolution: '1',
      outputs: 1,
      harness: false,
      brandingMode: 'off',
      isBrandingEnabled: false,
      waitForCompletion: false,
      references: ['avatar-mia', 'mia-1', 'mia-2', 'leo-1', 'style-1'],
    });
    expect((dto as { text: string }).text).toContain(
      'Mia opens the cafe door while Leo waves.',
    );
    expect((dto as { text: string }).text).toContain(
      'Keep every person consistent with the reference images.',
    );
    expect((dto as { text: string }).text).not.toMatch(/Mia, Leo/);
    expect((dto as { text: string }).text).toContain(
      DRAFT_GENERATION_CONFIG.sketchStyle,
    );
    expect(scope).toMatchObject({ settleCreditsExternally: true });
    const config = context.current();
    expect(config.revision).toBe(4);
    expect(config.plan?.shots[0].stillFreshness).toBe('generating');
    expect(config.stillOperations).toEqual([
      expect.objectContaining({
        shotId: 'shot-1',
        state: 'submitted',
        assetId: 'asset-1',
        reservationId: 'res-1',
        billing: 'reserved',
        credits: 4,
      }),
    ]);
    expect(context.credits.settleReservation).not.toHaveBeenCalled();
  });

  it('refuses a stale quote without dispatching or charging', async () => {
    const context = setup();
    const quote = await context.service.quote('org-1', 'brand-1', 'run-1', {
      expectedRevision: 4,
    });
    context.estimate.estimate.mockResolvedValueOnce({
      isAvailable: true,
      credits: 6,
      modelKey: KLEIN,
    });
    await expect(
      context.service.generate('org-1', 'brand-1', 'run-1', 'user-1', {
        expectedRevision: 4,
        shotIds: quote.items.map((item) => item.shotId),
        inputHash: quote.inputHash,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(context.images.generateImage).not.toHaveBeenCalled();
  });

  it('releases the hold when the image pipeline prices differently than the quote', async () => {
    const context = setup();
    context.images.generateImage.mockImplementationOnce(
      async (_user, _dto, request, onPlaceholderCreated, _scope, prepared) => {
        await onPlaceholderCreated('asset-x');
        request.creditsConfig = {
          deferred: true,
          amount: 9,
          reservationId: 'res-x',
        };
        await prepared();
        return { data: { id: 'asset-x' } };
      },
    );
    context.ingredients.set('asset-x', { status: 'FAILED' });
    await quoteAndGenerate(context, ['shot-1']);
    expect(context.credits.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'res-x',
    });
    expect(context.credits.settleReservation).not.toHaveBeenCalled();
    expect(context.current().plan?.shots[0].stillFreshness).toBe('failed');
  });

  it('fails the shot and refunds when dispatch dies before a placeholder', async () => {
    const context = setup();
    context.images.generateImage.mockRejectedValueOnce(
      new Error('Provider down'),
    );
    await quoteAndGenerate(context, ['shot-1']);
    const config = context.current();
    expect(config.plan?.shots[0].stillFreshness).toBe('failed');
    expect(config.stillOperations?.[0]).toMatchObject({
      state: 'failed',
      billing: 'none',
      errorCode: 'STORYBOARD_STILL_DISPATCH_FAILED',
    });
    expect(context.credits.settleReservation).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Provider down' }),
      expect.objectContaining({
        tags: expect.objectContaining({
          errorCode: 'STORYBOARD_STILL_DISPATCH_FAILED',
        }),
      }),
    );
  });

  it('refunds at once and fails the placeholder when dispatch throws after creating it', async () => {
    const context = setup();
    context.images.generateImage.mockImplementationOnce(
      async (_user, _dto, request, onPlaceholderCreated, _scope, onCredits) => {
        context.ingredients.set('asset-9', { status: 'PROCESSING' });
        await onPlaceholderCreated('asset-9');
        request.creditsConfig = {
          deferred: true,
          amount: 4,
          reservationId: 'res-9',
        };
        await onCredits();
        throw new Error('Generation quote hold has ended');
      },
    );
    await quoteAndGenerate(context, ['shot-1']);
    expect(context.ingredients.get('asset-9')?.status).toBe('FAILED');
    expect(context.credits.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'res-9',
    });
    expect(context.current().plan?.shots[0].stillFreshness).toBe('failed');
    expect(context.current().stillOperations?.[0]).toMatchObject({
      state: 'failed',
      billing: 'released',
      errorCode: 'STORYBOARD_STILL_DISPATCH_FAILED',
    });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('leaves a dispatch that threw after the provider accepted it to reconciliation', async () => {
    const context = setup();
    context.images.generateImage.mockImplementationOnce(
      async (_user, _dto, request, onPlaceholderCreated, _scope, onCredits) => {
        context.ingredients.set('asset-9', {
          status: 'PROCESSING',
          metadata: { externalProvider: 'replicate', externalId: 'pred-9' },
        });
        await onPlaceholderCreated('asset-9');
        request.creditsConfig = {
          deferred: true,
          amount: 4,
          reservationId: 'res-9',
        };
        await onCredits();
        throw new Error('Serialization failed');
      },
    );
    await quoteAndGenerate(context, ['shot-1']);
    expect(context.ingredients.get('asset-9')?.status).toBe('PROCESSING');
    expect(context.credits.releaseReservation).not.toHaveBeenCalled();
    expect(context.current().plan?.shots[0].stillFreshness).toBe('generating');
  });
});

describe('StoryboardStillsService reconcile', () => {
  it('charges a rendered still once and marks the shot fresh', async () => {
    const context = setup();
    await quoteAndGenerate(context, ['shot-1']);
    context.ingredients.set('asset-1', { status: 'GENERATED' });
    await context.service.reconcile('org-1', 'brand-1', 'run-1');
    await context.service.reconcile('org-1', 'brand-1', 'run-1');
    expect(context.credits.settleReservation).toHaveBeenCalledTimes(1);
    expect(context.credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        actorUserId: 'user-1',
        reservationId: 'res-1',
        actualAmount: 4,
        brandId: 'brand-1',
      }),
    );
    const config = context.current();
    expect(config.plan?.shots[0]).toMatchObject({
      stillAssetId: 'asset-1',
      stillFreshness: 'fresh',
    });
    expect(config.stillOperations?.[0]).toMatchObject({
      state: 'ready',
      billing: 'settled',
    });
  });

  it('attaches a still as stale when the action changed while it rendered', async () => {
    const context = setup();
    await quoteAndGenerate(context, ['shot-1']);
    context.edit((config) => {
      config.plan.shots[0].action = 'Mia leaves the cafe.';
    });
    context.ingredients.set('asset-1', { status: 'GENERATED' });
    await context.service.reconcile('org-1', 'brand-1', 'run-1');
    expect(context.current().plan?.shots[0]).toMatchObject({
      stillAssetId: 'asset-1',
      stillFreshness: 'stale',
    });
    expect(context.credits.settleReservation).toHaveBeenCalledTimes(1);
  });

  it('refunds a failed still and keeps the previous asset', async () => {
    const context = setup();
    await quoteAndGenerate(context, ['shot-2']);
    context.ingredients.set('asset-1', { status: 'FAILED' });
    await context.service.reconcile('org-1', 'brand-1', 'run-1');
    expect(context.credits.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'res-1',
    });
    expect(context.credits.settleReservation).not.toHaveBeenCalled();
    expect(context.current().plan?.shots[1]).toMatchObject({
      stillAssetId: 'old-still',
      stillFreshness: 'failed',
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Storyboard still failed: STORYBOARD_STILL_GENERATION_FAILED',
      }),
      expect.anything(),
    );
  });

  it('leaves processing stills alone and records an expired hold as released', async () => {
    const context = setup();
    await quoteAndGenerate(context, ['shot-1']);
    await context.service.reconcile('org-1', 'brand-1', 'run-1');
    expect(context.current().plan?.shots[0].stillFreshness).toBe('generating');
    context.ingredients.set('asset-1', { status: 'GENERATED' });
    context.credits.settleReservation.mockRejectedValueOnce(
      new UnsettleableReservationException('EXPIRED'),
    );
    await context.service.reconcile('org-1', 'brand-1', 'run-1');
    expect(context.current().stillOperations?.[0]).toMatchObject({
      state: 'ready',
      billing: 'released',
    });
  });

  it('refunds a dispatch that never left a placeholder', async () => {
    const context = setup();
    await quoteAndGenerate(context, ['shot-1']);
    context.edit((config) => {
      const stored = config as StoryboardNativeRunConfig & {
        stillOperations: Array<Record<string, unknown>>;
      };
      const [op] = stored.stillOperations;
      delete op.assetId;
      op.state = 'pending';
      op.updatedAt = '2026-01-01T00:00:00.000Z';
    });
    await context.service.reconcile('org-1', 'brand-1', 'run-1');
    expect(context.credits.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'res-1',
    });
    expect(context.current().stillOperations?.[0]).toMatchObject({
      state: 'failed',
      errorCode: 'STORYBOARD_STILL_NOT_DISPATCHED',
    });
  });

  it('fails a placeholder that never reached the provider even though its provider was recorded', async () => {
    const context = setup();
    await quoteAndGenerate(context, ['shot-1']);
    context.ingredients.set('asset-1', {
      status: 'PROCESSING',
      metadata: { externalProvider: 'replicate' },
    });
    await context.service.reconcile('org-1', 'brand-1', 'run-1');
    expect(context.current().plan?.shots[0].stillFreshness).toBe('generating');
    context.edit((config) => {
      const stored = config as StoryboardNativeRunConfig & {
        stillOperations: Array<Record<string, unknown>>;
      };
      stored.stillOperations[0].updatedAt = '2026-01-01T00:00:00.000Z';
    });
    await context.service.reconcile('org-1', 'brand-1', 'run-1');
    expect(context.ingredients.get('asset-1')?.status).toBe('FAILED');
    expect(context.credits.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'res-1',
    });
    expect(context.current().stillOperations?.[0]).toMatchObject({
      state: 'failed',
      errorCode: 'STORYBOARD_STILL_GENERATION_FAILED',
    });
    expect(context.current().plan?.shots[0].stillFreshness).toBe('failed');
  });

  it('keeps a submitted still while the provider still owns it', async () => {
    const context = setup();
    await quoteAndGenerate(context, ['shot-1']);
    context.ingredients.set('asset-1', {
      status: 'PROCESSING',
      metadata: { externalProvider: 'replicate', externalId: 'pred-1' },
    });
    context.edit((config) => {
      const stored = config as StoryboardNativeRunConfig & {
        stillOperations: Array<Record<string, unknown>>;
      };
      stored.stillOperations[0].updatedAt = '2026-01-01T00:00:00.000Z';
    });
    await context.service.reconcile('org-1', 'brand-1', 'run-1');
    expect(context.prisma.ingredient.updateMany).not.toHaveBeenCalled();
    expect(context.current().plan?.shots[0].stillFreshness).toBe('generating');
  });
});
