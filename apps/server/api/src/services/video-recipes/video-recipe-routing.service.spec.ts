import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { RouterService } from '@api/services/router/router.service';
import { VideoRecipeRoutingService } from '@api/services/video-recipes/video-recipe-routing.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelCategory, ModelLifecycle } from '@genfeedai/contracts';
import type {
  VideoRecipeRouting,
  VideoRecipeStepRouting,
} from '@genfeedai/contracts/api-types/contracts/video-recipe.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

const ORG = testId('org');
const BRAND = testId('brand');
const SEEDANCE = MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5;
const VEO = MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1;
const STAMP = new Date('2026-11-07T00:00:00.000Z');

function registryModel(
  key: string,
  overrides: Record<string, unknown> = {},
): ModelDocument {
  return {
    category: ModelCategory.VIDEO,
    cost: 400,
    costTier: 'high',
    createdAt: STAMP,
    id: testId('model'),
    isActive: true,
    isDefault: false,
    isDeleted: false,
    isDiscovered: false,
    isFree: false,
    isHighlighted: false,
    key,
    label: key,
    lifecycle: ModelLifecycle.RECOMMENDED,
    organizationId: null,
    provider: 'replicate',
    qualityTier: 'ultra',
    updatedAt: STAMP,
    ...overrides,
  } as unknown as ModelDocument;
}

/** An in-memory registry with the two reads the router and resolver make. */
function inMemoryModels(rows: ModelDocument[]) {
  const matches = (row: ModelDocument, filter: Record<string, unknown>) =>
    row.isActive &&
    !row.isDeleted &&
    (filter.category === undefined || row.category === filter.category) &&
    (filter.lifecycle === undefined || row.lifecycle === filter.lifecycle);
  return {
    findAllActive: async (filter: Record<string, unknown> = {}) =>
      rows.filter((row) => matches(row, filter)),
    findOne: async (filter: Record<string, unknown>) =>
      rows.find((row) => row.key === filter.key) ?? null,
  };
}

async function resolveRouting(input: {
  brandVideoDefault?: string | null;
  pins?: Record<string, string>;
  rows: ModelDocument[];
}): Promise<VideoRecipeRouting> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      VideoRecipeRoutingService,
      RouterService,
      { provide: ModelsService, useValue: inMemoryModels(input.rows) },
      {
        provide: LoggerService,
        useValue: {
          debug: () => {},
          error: () => {},
          log: () => {},
          warn: () => {},
        },
      },
      {
        provide: OrganizationSettingsService,
        useValue: { findOne: async () => null },
      },
      {
        provide: PrismaService,
        useValue: {
          brand: {
            findFirst: async (args: { where: { id: string } }) =>
              args.where.id === BRAND
                ? {
                    defaultImageModel: null,
                    defaultMusicModel: null,
                    defaultVideoModel: input.brandVideoDefault ?? null,
                  }
                : null,
          },
        },
      },
    ],
  }).compile();
  return moduleRef
    .get(VideoRecipeRoutingService)
    .resolve(ORG, BRAND, 'realistic-video', input.pins);
}

function step(
  routing: VideoRecipeRouting,
  stepId: string,
): VideoRecipeStepRouting | undefined {
  return routing.steps.find((entry) => entry.stepId === stepId);
}

describe('VideoRecipeRoutingService', () => {
  it('routes the final render to the model that takes video references, even when another model is the category default', async () => {
    const routing = await resolveRouting({
      rows: [registryModel(VEO, { isDefault: true }), registryModel(SEEDANCE)],
    });

    expect(step(routing, 'final-video')).toMatchObject({
      eligibleModelCount: 1,
      modelKey: SEEDANCE,
      source: 'registry-best',
    });
    expect(step(routing, 'draft-video')).toMatchObject({
      eligibleModelCount: 2,
      modelKey: VEO,
      source: 'registry-default',
    });
  });

  it('routes the final render to a new catalog model from its registry columns alone', async () => {
    const routing = await resolveRouting({
      rows: [
        registryModel(VEO, { isDefault: true }),
        registryModel('acme/next-video', {
          hasVideoReferences: true,
          maxOutputs: 1,
          maxReferences: 5,
          maxVideoReferences: 4,
        }),
      ],
    });

    expect(step(routing, 'final-video')).toMatchObject({
      eligibleModelCount: 1,
      modelKey: 'acme/next-video',
    });
  });

  it.each([
    { defaultKey: VEO, expected: VEO },
    { defaultKey: SEEDANCE, expected: SEEDANCE },
  ])(
    'follows the registry default $defaultKey for the draft step',
    async ({ defaultKey, expected }) => {
      const routing = await resolveRouting({
        rows: [
          registryModel(VEO, { isDefault: defaultKey === VEO }),
          registryModel(SEEDANCE, { isDefault: defaultKey === SEEDANCE }),
        ],
      });

      expect(step(routing, 'draft-video')?.modelKey).toBe(expected);
    },
  );

  it('honours a step pin over the brand default', async () => {
    const routing = await resolveRouting({
      brandVideoDefault: VEO,
      pins: { 'draft-video': SEEDANCE },
      rows: [registryModel(VEO), registryModel(SEEDANCE)],
    });

    expect(step(routing, 'draft-video')).toMatchObject({
      modelKey: SEEDANCE,
      source: 'pin',
    });
  });

  it('uses the brand default when there is no pin', async () => {
    const routing = await resolveRouting({
      brandVideoDefault: VEO,
      rows: [registryModel(VEO), registryModel(SEEDANCE, { isDefault: true })],
    });

    expect(step(routing, 'draft-video')).toMatchObject({
      modelKey: VEO,
      source: 'brand-default',
    });
  });

  it('ignores a pin the step cannot run on', async () => {
    const routing = await resolveRouting({
      pins: { 'final-video': VEO },
      rows: [registryModel(VEO), registryModel(SEEDANCE)],
    });

    expect(step(routing, 'final-video')?.modelKey).toBe(SEEDANCE);
  });

  it('names the missing capability and marks the recipe not runnable when no model qualifies', async () => {
    const routing = await resolveRouting({ rows: [registryModel(VEO)] });

    expect(routing.isRunnable).toBe(false);
    expect(step(routing, 'final-video')).toMatchObject({
      eligibleModelCount: 0,
      modelKey: null,
      unavailableReason:
        'No model in this category meets: at least 1 video references.',
    });
  });

  it('refuses a brand outside the organization', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        VideoRecipeRoutingService,
        { provide: RouterService, useValue: {} },
        { provide: ModelsService, useValue: inMemoryModels([]) },
        {
          provide: OrganizationSettingsService,
          useValue: { findOne: async () => null },
        },
        {
          provide: PrismaService,
          useValue: { brand: { findFirst: async () => null } },
        },
      ],
    }).compile();

    await expect(
      moduleRef
        .get(VideoRecipeRoutingService)
        .resolve(ORG, testId('brand', 2), 'realistic-video'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
