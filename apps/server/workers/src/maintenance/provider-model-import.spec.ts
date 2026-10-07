import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import type { PrismaClient } from '@genfeedai/prisma';
import {
  collectFalImportMetadata,
  collectProviderModel,
  providerModelCapabilities,
  providerModelImportTargets,
} from '@workers/maintenance/provider-model-import';
import { parseProviderModelImportArgs } from '@workers/maintenance/provider-model-import.args';
import {
  assertImportDatabaseTarget,
  persistProviderModel,
} from '@workers/maintenance/provider-model-import.persistence';
import { prepareReplicateModelContract } from '@workers/services/replicate-model-contract.util';
import { describe, expect, it, vi } from 'vitest';

const replicate = {
  category: ModelCategory.VIDEO,
  endpoint: 'alibaba/wan-3',
  provider: ModelProvider.REPLICATE,
} as const;
const fal = {
  category: ModelCategory.VIDEO,
  endpoint: 'blackforestlabs/flux-3/text-to-video',
  provider: ModelProvider.FAL,
} as const;
const input = {
  type: 'object',
  properties: {
    prompt: { type: 'string' },
    duration: { type: 'integer', minimum: 2, maximum: 30, default: 5 },
    aspect_ratio: {
      allOf: [{ $ref: '#/components/schemas/Aspect' }],
      default: '16:9',
    },
  },
  required: ['prompt'],
};
const openapi = {
  openapi: '3.0.0',
  components: {
    schemas: {
      Input: input,
      Output: { type: 'string', format: 'uri' },
      Aspect: { type: 'string', enum: ['16:9', '9:16'] },
    },
  },
};
const providerModel = {
  owner: 'alibaba',
  name: 'wan-3',
  latest_version: { id: 'version', openapi_schema: openapi },
  description: 'Video',
};
const falOpenapi = {
  ...openapi,
  paths: {
    '/generate': {
      post: {
        requestBody: { content: { 'application/json': { schema: input } } },
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    video: {
                      type: 'object',
                      properties: { url: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

function fakeFetch(...bodies: unknown[]) {
  return vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json(bodies.shift()));
}

describe('provider import selection and parameters', () => {
  it('includes the verified task variants and keeps provider identities separate', () => {
    const targets = providerModelImportTargets();
    expect(targets).toContainEqual(replicate);
    expect(targets).toContainEqual({
      ...fal,
      endpoint: 'blackforestlabs/flux-3/extend-video/draft',
      category: ModelCategory.VIDEO_EDIT,
    });
    expect(
      new Set(targets.map((target) => `${target.provider}:${target.endpoint}`))
        .size,
    ).toBe(targets.length);
  });
  it('resolves component enums and bounded duration values without changing raw schemas', () => {
    expect(providerModelCapabilities(input, openapi)).toMatchObject({
      aspectRatios: ['16:9', '9:16'],
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: Array.from({ length: 29 }, (_, i) => i + 2),
    });
    expect(input.properties.aspect_ratio.allOf).toEqual([
      { $ref: '#/components/schemas/Aspect' },
    ]);
    expect(
      providerModelCapabilities({
        properties: {
          duration: { enum: ['auto', 5, 6] },
          image_urls: { type: 'array' },
          last_frame_url: { type: 'string' },
        },
        required: ['image_urls'],
      }),
    ).toMatchObject({
      durations: [5, 6],
      hasEndFrame: true,
      isReferencesMandatory: true,
    });
    expect(
      providerModelCapabilities({
        properties: { duration: { minimum: 1, maximum: 10000 } },
      }).durations,
    ).toEqual([]);
  });
  it('rejects misspelled flags and requires an exact database destination for writes', () => {
    expect(
      parseProviderModelImportArgs(['--output', '/tmp/report.json']).live,
    ).toBe(false);
    expect(() =>
      parseProviderModelImportArgs(['--live', '--output', '/tmp/report.json']),
    ).toThrow('explicit_database_target');
    expect(() =>
      parseProviderModelImportArgs(['--all', '--output', '/tmp/report.json']),
    ).toThrow('unknown_import_argument');
    expect(
      assertImportDatabaseTarget(
        'postgresql://user:secret@db:5432/genfeed',
        'db:5432/genfeed',
      ),
    ).toContain('postgresql:');
    expect(() =>
      assertImportDatabaseTarget(
        'postgresql://user:secret@db:5432/genfeed',
        'other/genfeed',
      ),
    ).toThrow('database_target_mismatch');
  });
});

describe('read-only provider collection', () => {
  it('preserves earlier metadata batches when a retired endpoint batch returns 404', async () => {
    const targets = Array.from({ length: 11 }, (_, i) => ({
      ...fal,
      endpoint: `fal-ai/example-${i}`,
    }));
    const fetcher = fakeFetch({
      models: targets.slice(0, 10).map((target) => ({
        endpoint_id: target.endpoint,
        openapi: falOpenapi,
      })),
    });
    fetcher.mockImplementationOnce(async () =>
      Response.json({
        models: targets.slice(0, 10).map((target) => ({
          endpoint_id: target.endpoint,
          openapi: falOpenapi,
        })),
      }),
    );
    fetcher.mockImplementationOnce(async () =>
      Response.json({ error: 'not_found' }, { status: 404 }),
    );
    const models = await collectFalImportMetadata(targets, undefined, fetcher);
    expect(models.size).toBe(10);
    expect(models.has('fal-ai/example-10')).toBe(false);
  });
  it('rejects a provider response for a different identity before fetching pricing', async () => {
    const fetcher = fakeFetch({ ...providerModel, name: 'other' });
    await expect(
      collectProviderModel(replicate, { replicate: 'secret' }, fetcher),
    ).rejects.toThrow('mismatched_replicate_schema');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('collects public fal parameters without inventing an unauthenticated price', async () => {
    const fetcher = fakeFetch({
      models: [
        {
          endpoint_id: fal.endpoint,
          openapi: falOpenapi,
          metadata: { category: 'text-to-video', status: 'active' },
        },
      ],
    });
    const result = await collectProviderModel(fal, {}, fetcher);
    expect(result.contract.openapi).toEqual(falOpenapi);
    expect(result.contract.mappingStatus).toBe('quarantined');
    expect(result.contract.unsupportedReason).toBe('missing_pricing');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({});
  });
  it('collects every pricing page and refuses a stuck cursor', async () => {
    const model = {
      models: [
        {
          endpoint_id: fal.endpoint,
          openapi: falOpenapi,
          metadata: { category: 'text-to-video', status: 'active' },
        },
      ],
    };
    const price = {
      endpoint_id: fal.endpoint,
      currency: 'USD',
      unit: 'video_second',
      unit_price: '0.17',
    };
    const fetcher = fakeFetch(
      model,
      { prices: [price], has_more: true, next_cursor: 'next' },
      {
        prices: [{ ...price, unit_price: '0.29', resolution: '1080p' }],
        has_more: false,
      },
    );
    const result = await collectProviderModel(fal, { fal: 'secret' }, fetcher);
    expect(result.contract.pricing).toHaveLength(2);
    expect(result.contract.mappingStatus).toBe('quarantined');
    expect(
      fetcher.mock.calls.every((call) => call[1]?.method === undefined),
    ).toBe(true);
    expect(String(fetcher.mock.calls[2]?.[0])).toContain('cursor=next');
    await expect(
      collectProviderModel(
        fal,
        { fal: 'secret' },
        fakeFetch(
          model,
          { has_more: true, next_cursor: 'next' },
          { has_more: true, next_cursor: 'next' },
        ),
      ),
    ).rejects.toThrow('invalid_fal_pricing_pagination');
  });
});

async function observation() {
  return collectProviderModel(
    fal,
    {},
    fakeFetch({
      models: [
        {
          endpoint_id: fal.endpoint,
          openapi: falOpenapi,
          metadata: { category: 'text-to-video', status: 'active' },
        },
      ],
    }),
  );
}

function database(rows: Record<string, unknown>[]) {
  const tx = {
    model: {
      findMany: vi.fn().mockResolvedValue(rows),
      create: vi.fn().mockImplementation(({ data }) => ({
        ...data,
        id: 'model',
        reviewedProviderContractVersion: null,
      })),
      updateMany: vi.fn(),
    },
    modelProviderContract: {
      upsert: vi.fn().mockResolvedValue({ modelId: 'model' }),
    },
  };
  const prisma = {
    $transaction: vi.fn().mockImplementation((fn) => fn(tx)),
  } as unknown as PrismaClient;
  return { prisma, tx };
}

describe('pending-only registry persistence', () => {
  it('imports full snapshots without activating or assigning guessed runtime prices', async () => {
    const { prisma, tx } = database([]);
    await persistProviderModel(prisma, await observation());
    expect(tx.model.create.mock.calls[0]?.[0].data).toMatchObject({
      isActive: false,
      isPublic: false,
      isDefault: false,
      isFree: false,
      key: `fal/${fal.endpoint}`,
      organizationId: null,
    });
    expect(
      tx.model.create.mock.calls[0]?.[0].data.providerCostUsd,
    ).toBeUndefined();
    expect(tx.modelProviderContract.upsert.mock.calls[0]?.[0]).toMatchObject({
      create: { openapi: falOpenapi, reviewStatus: 'quarantined' },
      update: { lastSeenAt: expect.any(Date) },
    });
  });
  it('preserves approved runtime metadata and rates on an existing global model', async () => {
    const { prisma, tx } = database([
      {
        ...fal,
        id: 'model',
        key: 'custom-key',
        organizationId: null,
        isDeleted: false,
        reviewedProviderContractVersion: 'approved',
        isActive: true,
      },
    ]);
    await persistProviderModel(prisma, await observation());
    expect(tx.model.create).not.toHaveBeenCalled();
    const update = tx.model.updateMany.mock.calls[0]?.[0];
    expect(update.where).toEqual({
      id: 'model',
      organizationId: null,
      isDeleted: false,
    });
    expect(update.data).not.toHaveProperty('isActive');
    expect(update.data).not.toHaveProperty('providerCostUsd');
    expect(update.data).not.toHaveProperty('reviewedProviderContractVersion');
  });
  it.each([
    { isDeleted: true, organizationId: null },
    { isDeleted: false, organizationId: 'tenant' },
  ])('rejects protected records without writes (%j)', async (protectedRow) => {
    const { prisma, tx } = database([{ ...fal, id: 'model', ...protectedRow }]);
    await expect(
      persistProviderModel(prisma, await observation()),
    ).rejects.toThrow('protected_registry_identity_collision');
    expect(tx.model.create).not.toHaveBeenCalled();
    expect(tx.modelProviderContract.upsert).not.toHaveBeenCalled();
  });
});

it('retains unmapped Replicate billing evidence with a date-independent contract identity', () => {
  const pricing = {
    billing: {
      status: 'ok' as const,
      sourceUrl: 'https://replicate.com/alibaba/wan-3',
      tiers: [{ unexpected: true }],
    },
    source: 'reviewed-registry' as const,
    pricingType: null,
    unitPriceUsd: null,
  };
  // Collection validates the required metadata before using the provider interface.
  const model = providerModel as Parameters<
    typeof prepareReplicateModelContract
  >[1];
  const first = prepareReplicateModelContract(
    replicate.endpoint,
    model,
    replicate.category,
    pricing,
    new Date('2026-10-07'),
  );
  const second = prepareReplicateModelContract(
    replicate.endpoint,
    model,
    replicate.category,
    pricing,
    new Date('2026-10-08'),
  );
  expect(first.mappingStatus).toBe('quarantined');
  expect(first.pricing).toMatchObject({ rawTiers: [{ unexpected: true }] });
  expect(first.version).toBe(second.version);
});
