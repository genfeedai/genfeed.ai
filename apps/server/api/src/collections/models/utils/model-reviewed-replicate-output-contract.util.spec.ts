import { findReviewedReplicateOutputContract as readContract } from '@api/collections/models/utils/model-reviewed-replicate-output-contract.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { hashReplicateProviderContract } from '@libs/utils/provider-contract.util';
import { describe, expect, it, vi } from 'vitest';

function fixture(modelKey = 'owner/model', providerVersion = 'version-1') {
  const raw = {
    endpoint: 'owner/model',
    inputSchema: { type: 'object' },
    openapi: { openapi: '3.0.0' },
    outputSchema: { type: 'string', format: 'uri' },
    pricing: [{ source: 'curated-known-cost' }],
    schemaFamily: 'video',
  };
  const version = hashReplicateProviderContract({ ...raw, providerVersion });
  const contract = {
    ...raw,
    modelId: 'model-1',
    provider: 'replicate',
    version,
    reviewStatus: 'approved',
    mappingStatus: 'supported',
  };
  const model = {
    id: 'model-1',
    key: modelKey,
    provider: 'replicate',
    endpoint: 'owner/model',
    isActive: true,
    isDeleted: false,
    reviewedProviderContractVersion: version,
    providerContracts: [contract],
  };
  const findFirst = vi.fn().mockResolvedValue(model);
  const prisma = { model: { findFirst } } as unknown as PrismaService;
  return { contract, model, prisma, findFirst };
}

describe('exact reviewed Replicate output contract admission reader', () => {
  it('reads only the exact tenant/global catalog key and approved pointer, without approving its tariff', async () => {
    const f = fixture();
    const result = await readContract(
      f.prisma,
      'owner/model',
      { prompt: 'x' },
      'org-1',
    );
    expect(result).toMatchObject({
      status: 'reviewed',
      contract: {
        modelKey: 'owner/model',
        endpoint: 'owner/model',
        target: { model: 'owner/model' },
        output: { representation: 'uri' },
      },
    });
    expect(result).not.toHaveProperty('pricing');
    expect(result).not.toHaveProperty('quote');
    expect(f.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          key: 'owner/model',
          isDeleted: false,
          OR: [{ organizationId: 'org-1' }, { organizationId: null }],
        },
      }),
    );
  });
  it('uses global-only rows without a tenant and never scans other model keys', async () => {
    const f = fixture();
    await readContract(f.prisma, 'owner/model', {});
    expect(f.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          key: 'owner/model',
          isDeleted: false,
          organizationId: null,
        },
      }),
    );
    expect(f.findFirst).toHaveBeenCalledTimes(1);
  });
  it.each(['owner/model:version-1', 'version-1'])(
    'proves the actual immutable target for %s with the discovery hash',
    async (key) => {
      const f = fixture(key);
      expect(await readContract(f.prisma, key, {})).toMatchObject({
        status: 'reviewed',
        contract: {
          modelKey: key,
          endpoint: 'owner/model',
          target: { version: 'version-1' },
        },
      });
    },
  );
  it.each(['owner/model:version-1', 'version-1'])(
    'rejects an approved snapshot binding another provider version for %s',
    async (key) => {
      const f = fixture(key, 'version-2');
      expect(await readContract(f.prisma, key, {})).toEqual({
        status: 'unresolved',
        reason: 'provider_version_unverified',
      });
    },
  );
  it('does not strip a version suffix to find another model or treat raw version absence as permission', async () => {
    const f = fixture();
    f.findFirst.mockResolvedValue(null);
    expect(
      await readContract(f.prisma, 'owner/model:unknown', {}),
    ).toMatchObject({ status: 'unresolved' });
    expect(f.findFirst).toHaveBeenCalledTimes(1);
    expect(f.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'owner/model:unknown' }),
      }),
    );
  });
  it.each([
    { reviewStatus: 'pending' },
    { mappingStatus: 'quarantined' },
    { provider: 'fal' },
    { endpoint: 'other/model' },
    { modelId: 'other-model' },
    { version: 'pending-contract' },
  ])('rejects contract identity/status drift %#', async (patch) => {
    const f = fixture();
    Object.assign(f.contract, patch);
    expect(await readContract(f.prisma, 'owner/model', {})).toEqual({
      status: 'unresolved',
      reason: 'reviewed_output_contract_unavailable',
    });
  });
  it.each([
    { provider: 'fal' },
    { isActive: false },
    { isDeleted: true },
    { key: 'alias' },
  ])('rejects an unavailable selected model %#', async (patch) => {
    const f = fixture();
    Object.assign(f.model, patch);
    expect(await readContract(f.prisma, 'owner/model', {})).toMatchObject({
      status: 'unresolved',
      reason: 'exact_provider_model_unavailable',
    });
  });
  it('rejects a named endpoint mismatch and missing reviewed pointer', async () => {
    const f = fixture();
    f.model.endpoint = 'other/model';
    expect(await readContract(f.prisma, 'owner/model', {})).toMatchObject({
      status: 'unresolved',
      reason: 'provider_endpoint_mismatch',
    });
    f.model.endpoint = 'owner/model';
    f.model.reviewedProviderContractVersion = '';
    expect(await readContract(f.prisma, 'owner/model', {})).toMatchObject({
      status: 'unresolved',
      reason: 'reviewed_output_contract_unavailable',
    });
  });
  it('propagates storage uncertainty instead of producing an approved output contract', async () => {
    const f = fixture();
    f.findFirst.mockRejectedValue(new Error('storage unavailable'));
    await expect(readContract(f.prisma, 'owner/model', {})).rejects.toThrow(
      'storage unavailable',
    );
  });
  it('does not promote raw schema snapshots or an approved unbounded array to single-output admission', async () => {
    const f = fixture();
    f.findFirst.mockResolvedValue({
      ...f.model,
      providerContracts: [
        {
          ...f.contract,
          outputSchema: {
            type: 'array',
            items: { type: 'string', format: 'uri' },
          },
        },
      ],
    });
    expect(
      await readContract(f.prisma, 'owner/model', { num_outputs: 1 }),
    ).toEqual({
      status: 'unresolved',
      reason: 'output_cardinality_unverified',
    });
  });
  it('requires a new reviewed annotated snapshot and the explicit final count, not a default', async () => {
    const f = fixture('owner/model:version-1');
    const annotated = {
      ...f.contract,
      inputSchema: {
        type: 'object',
        properties: {
          num_outputs: { type: 'integer', minimum: 1, maximum: 4, default: 1 },
        },
      },
      outputSchema: {
        type: 'array',
        items: { type: 'string', format: 'uri' },
        'x-genfeed-output-count-input': 'num_outputs',
      },
    };
    // Altering a previously approved snapshot in place cannot preserve its version proof.
    f.findFirst.mockResolvedValue({
      ...f.model,
      providerContracts: [annotated],
    });
    expect(
      await readContract(f.prisma, 'owner/model:version-1', { num_outputs: 1 }),
    ).toMatchObject({
      status: 'unresolved',
      reason: 'provider_version_unverified',
    });
    const version = hashReplicateProviderContract({
      ...annotated,
      providerVersion: 'version-1',
    });
    f.findFirst.mockResolvedValue({
      ...f.model,
      reviewedProviderContractVersion: version,
      providerContracts: [{ ...annotated, version }],
    });
    expect(
      await readContract(f.prisma, 'owner/model:version-1', { num_outputs: 1 }),
    ).toMatchObject({
      status: 'reviewed',
      contract: { output: { countInput: 'num_outputs', outputs: 1 } },
    });
    expect(
      await readContract(f.prisma, 'owner/model:version-1', {}),
    ).toMatchObject({
      status: 'unresolved',
      reason: 'output_count_unverified',
    });
  });
  it('continues using the exact reviewed pointer when a newer pending snapshot exists', async () => {
    const f = fixture();
    f.findFirst.mockResolvedValue({
      ...f.model,
      pendingProviderContractVersion: 'new-pending',
      providerContracts: [
        {
          ...f.contract,
          version: 'new-pending',
          reviewStatus: 'pending',
          outputSchema: { type: 'object' },
        },
        f.contract,
      ],
    });
    expect(await readContract(f.prisma, 'owner/model', {})).toMatchObject({
      status: 'reviewed',
      contract: { version: f.contract.version },
    });
  });
});
