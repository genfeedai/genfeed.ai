import { StoryboardAssetBibleService } from '@api/collections/content-runs/services/storyboard-asset-bible.service';
import {
  storyboardPublicConfig,
  storyboardStoredRunConfigSchema,
} from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
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

const DESIGN = 'acme/design-1';
const EDIT = 'acme/edit-1';
const PRICES: Record<string, number> = { [DESIGN]: 4, [EDIT]: 6 };
const ROUTES: Record<string, { modelKey: string; category: string }> = {
  'character-design': { modelKey: DESIGN, category: 'image' },
  props: { modelKey: DESIGN, category: 'image' },
  environment: { modelKey: DESIGN, category: 'image' },
  'asset-angles': { modelKey: EDIT, category: 'image-edit' },
  'character-realism': { modelKey: EDIT, category: 'image-edit' },
  'environment-edit': { modelKey: EDIT, category: 'image-edit' },
};

function draftConfig(): StoryboardNativeRunConfig {
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
      selector: { kind: 'brief', brief: 'Mia is late for work.' },
      capturedAt: '2026-11-07T12:00:00.000Z',
    },
    plan: {
      videoModelKey: null,
      title: 'Late',
      logline: '',
      format: '9:16',
      runtimeBudgetSeconds: 20,
      styleReferenceAssetIds: [],
      cast: [{ id: 'mia', name: 'Mia', referenceAssetIds: [] }],
      shots: [],
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
        {
          id: 'mia-body',
          kind: 'character_body',
          label: 'Mia costume',
          castMemberId: 'mia',
          brief: 'red raincoat, white sneakers',
          sourceAssetIds: [],
          variantAssetIds: [],
        },
        {
          id: 'kitchen',
          kind: 'environment',
          label: 'kitchen',
          sourceAssetIds: ['room-1'],
          variantAssetIds: ['room-2'],
          chosenAssetId: 'room-2',
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
    createdAt: new Date('2026-11-07T12:00:00.000Z'),
    updatedAt: new Date('2026-11-07T12:00:00.000Z'),
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
        config: storyboardPublicConfig(
          storyboardStoredRunConfigSchema.parse(next),
        ),
      };
    }),
  };
  const ingredients = new Map<string, { status: string }>();
  const prisma = {
    ingredient: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = ingredients.get(where.id);
        return row ? { id: where.id, metadata: null, ...row } : null;
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  const routing = {
    resolve: vi.fn(async () => ({
      steps: Object.entries(ROUTES).map(([stepId, route]) => ({
        stepId,
        label: stepId,
        category: route.category,
        modelKey: route.modelKey,
        unavailableReason: null,
      })),
    })),
  };
  const models = {
    findOne: vi.fn(async ({ key }: { key: string }) => ({
      key,
      provider: 'fal',
    })),
  };
  const estimate = {
    estimate: vi.fn(async ({ modelKey }: { modelKey: string }) => ({
      isAvailable: true,
      credits: PRICES[modelKey] ?? null,
      modelKey,
    })),
  };
  const byok = { isByokActiveForProvider: vi.fn(async () => false) };
  const dispatched: Array<{ kind: 'generate' | 'edit'; dto: unknown }> = [];
  const fakeDispatch =
    (kind: 'generate' | 'edit') =>
    async (...args: unknown[]) => {
      const dto = (kind === 'edit' ? args[2] : args[1]) as {
        model: string;
      };
      const request = (kind === 'edit' ? args[3] : args[2]) as {
        creditsConfig?: Record<string, unknown>;
      };
      const onPlaceholderCreated = (kind === 'edit' ? args[4] : args[3]) as (
        id: string,
      ) => Promise<void>;
      const onCreditsPrepared = (
        kind === 'edit' ? args[6] : args[5]
      ) as () => Promise<void>;
      dispatched.push({
        kind,
        dto: kind === 'edit' ? { base: args[1], ...dto } : dto,
      });
      const id = `image-${dispatched.length}`;
      ingredients.set(id, { status: 'PROCESSING' });
      await onPlaceholderCreated(id);
      request.creditsConfig = {
        deferred: true,
        amount: PRICES[dto.model],
        reservationId: `res-${dispatched.length}`,
      };
      await onCreditsPrepared();
      return { data: { id } };
    };
  const images = {
    generateImage: vi.fn(fakeDispatch('generate')),
    editImage: vi.fn(fakeDispatch('edit')),
  };
  const credits = {
    settleReservation: vi.fn(async () => ({})),
    releaseReservation: vi.fn(async () => ({})),
    findReservationForWorkload: vi.fn(async () => null),
  };
  const service = new StoryboardAssetBibleService(
    prisma as never,
    store as never,
    { validatePlanAssets: vi.fn(async () => undefined) } as never,
    routing as never,
    models as never,
    estimate as never,
    byok as never,
    images as never,
    credits as never,
    { warn: vi.fn(), error: vi.fn() } as never,
  );
  const publicConfig = () =>
    storyboardPublicConfig(storyboardStoredRunConfigSchema.parse(stored));
  return { service, dispatched, ingredients, credits, publicConfig };
}

async function generate(
  context: ReturnType<typeof setup>,
  request: Record<string, unknown>,
) {
  const quote = await context.service.quote('org-1', 'brand-1', 'run-1', {
    expectedRevision: 3,
    ...request,
  });
  await context.service.start('org-1', 'brand-1', 'run-1', 'user-1', {
    expectedRevision: 3,
    ...request,
    inputHash: quote.inputHash,
  });
  return quote;
}

function finish(context: ReturnType<typeof setup>, status = 'GENERATED') {
  for (const row of context.ingredients.values()) row.status = status;
  return context.service.reconcile('org-1', 'brand-1', 'run-1');
}

function entry(context: ReturnType<typeof setup>, id: string) {
  return context.publicConfig().plan.assetBible?.find((item) => item.id === id);
}

describe('StoryboardAssetBibleService', () => {
  it('quotes character sheets on the recipe’s design model, in an empty outdoor place', async () => {
    const { service } = setup();
    const quote = await service.quote('org-1', 'brand-1', 'run-1', {
      expectedRevision: 3,
      entryId: 'mia-body',
      action: 'variants',
      count: 2,
    });
    expect(quote).toMatchObject({
      stepId: 'character-design',
      modelKey: DESIGN,
      billingMode: 'platform',
      total: 8,
    });
    expect(quote.items).toHaveLength(2);
    expect(quote.items[0]?.prompt).toContain(
      'Empty outdoor setting with no other people',
    );
    expect(quote.items[0]?.prompt).toContain(
      'Mia: red raincoat, white sneakers',
    );
  });

  it('adds rendered variants to the entry, chooses the first and charges each once', async () => {
    const context = setup();
    await generate(context, {
      entryId: 'mia-body',
      action: 'variants',
      count: 2,
    });
    await finish(context);
    expect(entry(context, 'mia-body')).toMatchObject({
      variantAssetIds: ['image-1', 'image-2'],
      chosenAssetId: 'image-1',
    });
    expect(context.credits.settleReservation).toHaveBeenCalledTimes(2);
    await context.service.reconcile('org-1', 'brand-1', 'run-1');
    expect(context.credits.settleReservation).toHaveBeenCalledTimes(2);
    expect(context.publicConfig().assetGenerations).toMatchObject([
      { entryId: 'mia-body', state: 'ready', assetId: 'image-1', credits: 4 },
      { entryId: 'mia-body', state: 'ready', assetId: 'image-2', credits: 4 },
    ]);
  });

  it('dresses a real person’s photo in the chosen costume and keeps the photo as the face', async () => {
    const context = setup();
    await generate(context, {
      entryId: 'mia-body',
      action: 'variants',
      count: 1,
    });
    await finish(context);
    await generate(context, { entryId: 'mia-body', action: 'costume' });
    expect(context.dispatched.at(-1)).toMatchObject({
      kind: 'edit',
      dto: { base: 'photo-1', references: ['image-1'], model: EDIT },
    });
    await finish(context);
    expect(entry(context, 'mia-face')).toMatchObject({
      sourceAssetIds: ['photo-1'],
      chosenAssetId: 'photo-1',
    });
    expect(entry(context, 'mia-body')?.variantAssetIds).toEqual([
      'image-1',
      'image-2',
    ]);
  });

  it('edits an environment from its chosen image and keeps the structure', async () => {
    const context = setup();
    const quote = await generate(context, {
      entryId: 'kitchen',
      action: 'edit',
      instruction: 'Make it night with the lights off.',
    });
    expect(quote).toMatchObject({ stepId: 'environment-edit', total: 6 });
    expect(context.dispatched).toEqual([
      {
        kind: 'edit',
        dto: expect.objectContaining({
          base: 'room-2',
          references: [],
          prompt:
            'Make it night with the lights off. Keep the layout, perspective, structure and lighting of image 1.',
        }),
      },
    ]);
  });

  it('refunds an image that fails and adds nothing to the entry', async () => {
    const context = setup();
    await generate(context, {
      entryId: 'kitchen',
      action: 'variants',
      count: 1,
    });
    await finish(context, 'FAILED');
    expect(context.credits.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'res-1',
    });
    expect(entry(context, 'kitchen')?.variantAssetIds).toEqual(['room-2']);
    expect(context.publicConfig().assetGenerations?.[0]).toMatchObject({
      state: 'failed',
      errorCode: 'STORYBOARD_ASSET_FAILED',
    });
  });

  it.each([
    [
      { entryId: 'mia-body', action: 'angles', angles: ['the back'] },
      'Choose an image for Mia costume first.',
    ],
    [
      { entryId: 'kitchen', action: 'costume' },
      'Only a character body takes a costume swap.',
    ],
    [
      { entryId: 'mia-face', action: 'edit', instruction: 'Brighter' },
      'Only an environment takes an edit.',
    ],
    [
      { entryId: 'missing', action: 'variants' },
      'Asset bible entry missing not found.',
    ],
  ])('refuses %j', async (request, message) => {
    const { service } = setup();
    const error = await service
      .quote('org-1', 'brand-1', 'run-1', { expectedRevision: 3, ...request })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(message);
  });

  it('refuses a second call while the entry is still generating', async () => {
    const context = setup();
    await generate(context, {
      entryId: 'kitchen',
      action: 'variants',
      count: 1,
    });
    await expect(
      generate(context, { entryId: 'kitchen', action: 'variants', count: 1 }),
    ).rejects.toThrow('Images for this entry are already generating.');
  });
});
