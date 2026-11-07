import {
  storyboardPublicConfig,
  storyboardStoredRunConfigSchema,
} from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import { StoryboardShotRendersService } from '@api/collections/content-runs/services/storyboard-shot-renders.service';
import { ModelCategory } from '@genfeedai/contracts';
import type { StoryboardNativeRunConfig } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
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

const FINAL = 'acme/cine-2';
const DRAFT = 'acme/cine-2-lite';
const DRAFT_PRICE = 3;
const FINAL_PRICE = 20;

function approvedConfig(): StoryboardNativeRunConfig {
  return {
    origin: 'native',
    contract: 'storyboard-run',
    version: 1,
    revision: 7,
    approvedRevision: 7,
    state: 'approved',
    clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
    createdByUserId: 'user-1',
    submittedInputHash: 'a'.repeat(64),
    sourceSnapshot: {
      selector: { kind: 'brief', brief: 'A rainy night chase.' },
      capturedAt: '2026-11-07T12:00:00.000Z',
    },
    plan: {
      videoModelKey: FINAL,
      title: 'Chase',
      logline: '',
      format: '16:9',
      runtimeBudgetSeconds: 20,
      styleLabel: 'Handheld 35mm',
      styleReferenceAssetIds: ['style-1', 'style-2'],
      cast: [
        {
          id: 'cast-mia',
          name: 'Mia',
          avatarAssetId: 'avatar-mia',
          referenceAssetIds: ['mia-1'],
        },
      ],
      shots: [
        {
          id: 'shot-1',
          ordinal: 1,
          action: 'Mia sprints down a wet alley.',
          dialogue: 'Not tonight.',
          speakerId: 'cast-mia',
          onScreenSpeaker: true,
          durationSeconds: 5,
          stillAssetId: 'still-1',
          stillFreshness: 'fresh',
          transition: 'cut',
        },
        {
          id: 'shot-2',
          ordinal: 2,
          action: 'Neon sign flickers over the empty street.',
          onScreenSpeaker: false,
          durationSeconds: 8,
          stillAssetId: 'still-2',
          stillFreshness: 'fresh',
          transition: 'cut',
        },
      ],
    },
  };
}

function modelRow(key: string, fields: Record<string, unknown>) {
  const now = new Date('2026-11-01T00:00:00.000Z');
  return {
    id: `model-${key}`,
    key,
    label: key,
    category: ModelCategory.VIDEO,
    provider: 'fal',
    lifecycle: 'active',
    cost: 1,
    isActive: true,
    isDefault: false,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
    maxOutputs: 1,
    ...fields,
  };
}

function setup(initial: StoryboardNativeRunConfig = approvedConfig()) {
  let stored: unknown = structuredClone(initial);
  const record = () => ({
    id: 'run-1',
    brandId: 'brand-1',
    organizationId: 'org-1',
    createdAt: new Date('2026-11-07T12:00:00.000Z'),
    updatedAt: new Date('2026-11-07T12:00:00.000Z'),
    config: structuredClone(stored),
  });
  const store = {
    read: vi.fn(
      async (
        _org: string,
        _brand: string,
        _runId: string,
        expected?: number,
      ) => {
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
        config: storyboardPublicConfig(
          storyboardStoredRunConfigSchema.parse(next),
        ),
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
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  const rows: Record<string, ReturnType<typeof modelRow>> = {
    [FINAL]: modelRow(FINAL, {
      maxReferences: 4,
      durations: [4, 6, 8],
      hasAudioToggle: true,
      draftModelKeys: ['acme/not-offered', DRAFT],
    }),
    [DRAFT]: modelRow(DRAFT, {
      maxReferences: 4,
      durations: [4, 6, 8],
      hasAudioToggle: true,
      draftModelKeys: [],
    }),
  };
  const capabilities = {
    resolve: vi.fn(async () => ({
      status: 'available',
      effectiveModel: { key: FINAL, supportedDurationsSeconds: [4, 6, 8] },
      eligibleModels: [
        { key: DRAFT, supportedDurationsSeconds: [4, 6, 8] },
        { key: FINAL, supportedDurationsSeconds: [4, 6, 8] },
      ],
    })),
  };
  const models = {
    findOne: vi.fn(async ({ key }: { key: string }) => rows[key] ?? null),
  };
  const prices: Record<string, number> = {
    [DRAFT]: DRAFT_PRICE,
    [FINAL]: FINAL_PRICE,
  };
  const estimate = {
    estimate: vi.fn(async ({ modelKey }: Record<string, unknown>) => ({
      isAvailable: true,
      credits: prices[String(modelKey)] ?? null,
      modelKey,
    })),
  };
  const byok = { isByokActiveForProvider: vi.fn(async () => false) };
  const dispatched: Array<Record<string, unknown>> = [];
  const videos = {
    generateVideo: vi.fn(
      async (
        _user: unknown,
        dto: Record<string, unknown>,
        request: { creditsConfig?: Record<string, unknown> },
        onPlaceholderCreated: (id: string) => Promise<void>,
        _scope: unknown,
        onCreditsPrepared: () => Promise<void>,
      ) => {
        dispatched.push(dto);
        const id = `clip-${dispatched.length}`;
        ingredients.set(id, { status: 'PROCESSING' });
        await onPlaceholderCreated(id);
        request.creditsConfig = {
          deferred: true,
          amount: prices[String(dto.model)],
          reservationId: `res-${dispatched.length}`,
        };
        await onCreditsPrepared();
        return { data: { id } };
      },
    ),
  };
  const credits = {
    settleReservation: vi.fn(async () => ({})),
    releaseReservation: vi.fn(async () => ({})),
    findReservationForWorkload: vi.fn(async () => null),
  };
  const source = { validatePlanAssets: vi.fn(async () => undefined) };
  const logger = { warn: vi.fn(), error: vi.fn() };
  const service = new StoryboardShotRendersService(
    prisma as never,
    store as never,
    source as never,
    capabilities as never,
    models as never,
    estimate as never,
    byok as never,
    videos as never,
    credits as never,
    logger as never,
  );
  const publicConfig = () =>
    storyboardPublicConfig(storyboardStoredRunConfigSchema.parse(stored));
  const edit = (change: (config: StoryboardNativeRunConfig) => void) => {
    const next = structuredClone(stored) as StoryboardNativeRunConfig;
    change(next);
    stored = next;
  };
  return {
    service,
    dispatched,
    ingredients,
    credits,
    estimate,
    publicConfig,
    edit,
  };
}

async function render(
  context: ReturnType<typeof setup>,
  stage: 'draft' | 'final',
  shotIds?: string[],
) {
  const quote = await context.service.quote('org-1', 'brand-1', 'run-1', {
    expectedRevision: 7,
    stage,
    ...(shotIds ? { shotIds } : {}),
  });
  await context.service.start('org-1', 'brand-1', 'run-1', 'user-1', {
    expectedRevision: 7,
    stage,
    shotIds: quote.items.map((item) => item.shotId),
    inputHash: quote.inputHash,
  });
  return quote;
}

function finish(context: ReturnType<typeof setup>, status = 'GENERATED') {
  for (const row of context.ingredients.values()) row.status = status;
  return context.service.reconcile('org-1', 'brand-1', 'run-1');
}

describe('StoryboardShotRendersService quote', () => {
  it('refuses to render a storyboard that is not approved', async () => {
    const config = approvedConfig();
    config.approvedRevision = undefined;
    config.state = 'storyboard';
    const { service } = setup(config);
    await expect(
      service.quote('org-1', 'brand-1', 'run-1', {
        expectedRevision: 7,
        stage: 'draft',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('drafts every shot on the first offered sibling at its shortest length', async () => {
    const { service } = setup();
    const quote = await service.quote('org-1', 'brand-1', 'run-1', {
      expectedRevision: 7,
      stage: 'draft',
    });
    expect(quote).toMatchObject({
      stage: 'draft',
      modelKey: DRAFT,
      billingMode: 'platform',
      items: [
        { shotId: 'shot-1', credits: DRAFT_PRICE, durationSeconds: 4 },
        { shotId: 'shot-2', credits: DRAFT_PRICE, durationSeconds: 4 },
      ],
      total: DRAFT_PRICE * 2,
    });
  });

  it('renders a final at the shortest model length that covers the shot', async () => {
    const { service } = setup();
    const quote = await service.quote('org-1', 'brand-1', 'run-1', {
      expectedRevision: 7,
      stage: 'final',
    });
    expect(quote.modelKey).toBe(FINAL);
    expect(quote.items).toEqual([
      { shotId: 'shot-1', credits: FINAL_PRICE, durationSeconds: 6 },
      { shotId: 'shot-2', credits: FINAL_PRICE, durationSeconds: 8 },
    ]);
  });

  it('prices each shot with as many references as it sends', async () => {
    const context = setup();
    context.estimate.estimate.mockImplementation(
      async ({ modelKey, referenceUrls }: Record<string, unknown>) => ({
        isAvailable: true,
        credits: (referenceUrls as string[] | undefined)?.length ?? 0,
        modelKey,
      }),
    );
    const quote = await context.service.quote('org-1', 'brand-1', 'run-1', {
      expectedRevision: 7,
      stage: 'draft',
    });
    expect(quote.items).toEqual([
      { shotId: 'shot-1', credits: 4, durationSeconds: 4 },
      { shotId: 'shot-2', credits: 3, durationSeconds: 4 },
    ]);
    expect(quote.total).toBe(7);
  });

  it('refuses a long-form storyboard', async () => {
    const config = approvedConfig();
    config.plan.shots = [];
    config.plan.longForm = {
      runtimeBudgetSeconds: 60,
      segments: [],
    };
    const { service } = setup(config);
    await expect(
      service.quote('org-1', 'brand-1', 'run-1', {
        expectedRevision: 7,
        stage: 'draft',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('StoryboardShotRendersService render', () => {
  it('sends the draft silent, marked as a draft, with the shot still first', async () => {
    const context = setup();
    await render(context, 'draft', ['shot-1']);
    expect(context.dispatched).toEqual([
      expect.objectContaining({
        model: DRAFT,
        duration: 4,
        isAudioEnabled: false,
        isDraft: true,
        references: ['still-1', 'avatar-mia', 'mia-1', 'style-1'],
        text: 'Mia sprints down a wet alley. Keep every person consistent with the reference images. Visual style: Handheld 35mm.',
      }),
    ]);
  });

  it('keeps identity when the speaker avatar is the only cast reference', async () => {
    const config = approvedConfig();
    config.plan.cast[0].referenceAssetIds = [];
    const context = setup(config);
    await render(context, 'draft', ['shot-1']);
    expect(context.dispatched[0]?.text).toBe(
      'Mia sprints down a wet alley. Keep every person consistent with the reference images. Visual style: Handheld 35mm.',
    );
  });

  it('shows a rendered draft on the run and charges it once', async () => {
    const context = setup();
    await render(context, 'draft', ['shot-1']);
    await finish(context);
    await finish(context);
    expect(context.credits.settleReservation).toHaveBeenCalledTimes(1);
    expect(context.publicConfig().shotRenders).toEqual([
      expect.objectContaining({
        shotId: 'shot-1',
        stage: 'draft',
        state: 'ready',
        assetId: 'clip-1',
        credits: DRAFT_PRICE,
        isCurrent: true,
      }),
    ]);
  });

  it('promotes a current draft with its references, adding the spoken line the silent draft left out', async () => {
    const context = setup();
    await render(context, 'draft', ['shot-1']);
    await finish(context);
    const draft = context.publicConfig().shotRenders?.[0];
    const quote = await render(context, 'final', ['shot-1']);
    expect(quote.items).toEqual([
      {
        shotId: 'shot-1',
        credits: FINAL_PRICE,
        durationSeconds: 6,
        promotedFromOperationId: draft?.operationId,
      },
    ]);
    expect(quote.total).toBe(FINAL_PRICE);
    expect(context.dispatched[1]).toEqual(
      expect.objectContaining({
        model: FINAL,
        isDraft: false,
        isAudioEnabled: true,
        text: 'Mia sprints down a wet alley. Spoken line: "Not tonight." Keep every person consistent with the reference images. Visual style: Handheld 35mm.',
        references: draft?.referenceAssetIds,
      }),
    );
  });

  it('marks a final stale once the shot length changes, keeping its draft current', async () => {
    const context = setup();
    await render(context, 'draft', ['shot-1']);
    await finish(context);
    await render(context, 'final', ['shot-1']);
    await finish(context);
    context.edit((config) => {
      config.plan.shots[0].durationSeconds = 8;
    });
    expect(
      context
        .publicConfig()
        .shotRenders?.map(({ stage, isCurrent }) => ({ stage, isCurrent })),
    ).toEqual([
      { stage: 'draft', isCurrent: true },
      { stage: 'final', isCurrent: false },
    ]);
  });

  it('compiles a fresh final once the shot changed after its draft', async () => {
    const context = setup();
    await render(context, 'draft', ['shot-1']);
    await finish(context);
    context.edit((config) => {
      config.plan.shots[0].action = 'Mia vaults a fence in the rain.';
    });
    expect(context.publicConfig().shotRenders?.[0]?.isCurrent).toBe(false);
    const quote = await render(context, 'final', ['shot-1']);
    expect(quote.items[0]?.promotedFromOperationId).toBeUndefined();
    expect(context.dispatched[1]?.text).toBe(
      'Mia vaults a fence in the rain. Spoken line: "Not tonight." Keep every person consistent with the reference images. Visual style: Handheld 35mm.',
    );
  });

  it('refunds a render the provider failed and shows the failure', async () => {
    const context = setup();
    await render(context, 'final', ['shot-2']);
    await finish(context, 'FAILED');
    expect(context.credits.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'res-1',
    });
    expect(context.credits.settleReservation).not.toHaveBeenCalled();
    expect(context.publicConfig().shotRenders).toEqual([
      expect.objectContaining({
        shotId: 'shot-2',
        stage: 'final',
        state: 'failed',
        errorCode: 'STORYBOARD_RENDER_FAILED',
      }),
    ]);
  });

  it('rejects a second render of a shot that is still rendering', async () => {
    const context = setup();
    await render(context, 'draft', ['shot-1']);
    await expect(
      context.service.quote('org-1', 'brand-1', 'run-1', {
        expectedRevision: 7,
        stage: 'draft',
        shotIds: ['shot-1'],
      }),
    ).rejects.toThrow('Shot 1 is already rendering.');
  });

  it('rejects a start whose quote no longer matches', async () => {
    const context = setup();
    await expect(
      context.service.start('org-1', 'brand-1', 'run-1', 'user-1', {
        expectedRevision: 7,
        stage: 'draft',
        shotIds: ['shot-1'],
        inputHash: 'b'.repeat(64),
      }),
    ).rejects.toThrow(ConflictException);
    expect(context.dispatched).toEqual([]);
  });
});
