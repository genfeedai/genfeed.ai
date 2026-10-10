import { findReviewedFalVideoOutputContract as readContract } from '@api/collections/models/utils/model-reviewed-fal-video-output-contract.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { hashProviderContract } from '@libs/utils/provider-contract.util';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const raw = {
    endpoint: 'bytedance/seedance-1.5-pro/image-to-video',
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' } } },
    outputSchema: {
      type: 'object',
      required: ['video'],
      properties: {
        video: {
          type: 'object',
          required: ['url'],
          properties: { url: { type: 'string', format: 'uri' } },
        },
      },
    },
    openapi: { openapi: '3.0.0' },
    pricing: [{ unit: 'second', unitPrice: '0.1' }],
    schemaFamily: 'video-image-v1',
  };
  const snapshot = {
    ...raw,
    modelId: 'model-1',
    provider: 'fal',
    version: hashProviderContract(raw),
    reviewStatus: 'approved',
    mappingStatus: 'supported',
  };
  const model = {
    id: 'model-1',
    key: `fal/${raw.endpoint}`,
    provider: 'fal',
    endpoint: raw.endpoint,
    isActive: true,
    isDeleted: false,
    reviewedProviderContractVersion: snapshot.version,
    providerContracts: [snapshot],
  };
  const findFirst = vi.fn().mockResolvedValue(model);
  const prisma = { model: { findFirst } } as unknown as PrismaService;
  return { model, snapshot, findFirst, prisma };
}

describe('reviewed Fal video workflow output contract', () => {
  it('reads exact tenant/global identity and returns the reviewed preparation schema without approving pricing', async () => {
    const f = fixture();
    const result = await readContract(f.prisma, f.model.key, 'org-1');
    expect(result).toMatchObject({
      status: 'reviewed',
      inputSchema: f.snapshot.inputSchema,
      contract: {
        provider: 'fal',
        target: { endpoint: f.model.endpoint },
        output: { representation: 'video-object', outputs: 1 },
      },
    });
    expect(result).not.toHaveProperty('pricing');
    expect(result).not.toHaveProperty('quote');
    expect(f.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          key: f.model.key,
          isDeleted: false,
          OR: [{ organizationId: 'org-1' }, { organizationId: null }],
        },
      }),
    );
  });
  it('keeps global-only reads scoped and does not scan a different model when the selected row is absent', async () => {
    const f = fixture();
    f.findFirst.mockResolvedValue(null);
    expect(await readContract(f.prisma, f.model.key)).toEqual({
      status: 'unresolved',
      reason: 'exact_provider_model_unavailable',
    });
    expect(f.findFirst).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        where: {
          key: f.model.key,
          isDeleted: false,
          organizationId: null,
        },
      }),
    );
  });
  it.each([
    { provider: 'replicate' },
    { isActive: false },
    { isDeleted: true },
    { key: 'alias' },
  ])('refuses unavailable or aliased catalog rows %#', async (patch) => {
    const f = fixture();
    Object.assign(f.model, patch);
    expect(
      await readContract(f.prisma, `fal/${f.snapshot.endpoint}`),
    ).toMatchObject({
      status: 'unresolved',
      reason: 'exact_provider_model_unavailable',
    });
  });
  it('rejects a changed endpoint and missing review pointer', async () => {
    const f = fixture();
    f.model.endpoint = 'different/endpoint';
    expect(await readContract(f.prisma, f.model.key)).toMatchObject({
      reason: 'provider_endpoint_mismatch',
    });
    f.model.endpoint = f.snapshot.endpoint;
    f.model.reviewedProviderContractVersion = '';
    expect(await readContract(f.prisma, f.model.key)).toMatchObject({
      reason: 'reviewed_output_contract_unavailable',
    });
  });
  it.each([
    { reviewStatus: 'pending' },
    { mappingStatus: 'quarantined' },
    { provider: 'replicate' },
    { endpoint: 'other/model' },
    { modelId: 'other-model' },
    { version: 'unreviewed' },
  ])('refuses snapshot status or identity drift %#', async (patch) => {
    const f = fixture();
    Object.assign(f.snapshot, patch);
    expect(await readContract(f.prisma, f.model.key)).toMatchObject({
      reason: 'reviewed_output_contract_unavailable',
    });
  });
  it('refuses mutated approved bytes without a new reviewed snapshot identity', async () => {
    const f = fixture();
    f.snapshot.inputSchema.properties.prompt.type = 'number';
    expect(await readContract(f.prisma, f.model.key)).toMatchObject({
      reason: 'provider_snapshot_unverified',
    });
  });
  it.each([
    { type: 'array', items: { type: 'string' } },
    { type: 'object', properties: { videos: { type: 'array' } } },
    {
      type: 'object',
      required: ['video'],
      properties: { video: { anyOf: [{ type: 'object' }, { type: 'null' }] } },
    },
    {
      type: 'object',
      properties: {
        video: { type: 'object', properties: { url: { type: 'string' } } },
      },
    },
  ])(
    'refuses a genuinely reviewed but ambiguous or optional output shape %#',
    async (outputSchema) => {
      const f = fixture();
      const raw = { ...f.snapshot, outputSchema };
      const version = hashProviderContract({
        endpoint: raw.endpoint,
        inputSchema: raw.inputSchema,
        outputSchema,
        openapi: raw.openapi,
        pricing: raw.pricing,
        schemaFamily: raw.schemaFamily,
      });
      f.findFirst.mockResolvedValue({
        ...f.model,
        reviewedProviderContractVersion: version,
        providerContracts: [{ ...raw, version }],
      });
      expect(await readContract(f.prisma, f.model.key)).toMatchObject({
        reason: 'unsupported_video_output_schema',
      });
    },
  );
  it('propagates storage uncertainty without creating an approval', async () => {
    const f = fixture();
    f.findFirst.mockRejectedValue(new Error('storage unavailable'));
    await expect(readContract(f.prisma, f.model.key)).rejects.toThrow(
      'storage unavailable',
    );
  });
});
