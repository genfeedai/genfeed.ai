vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@server/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ModelCategory, ModelLifecycle, ModelProvider } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import { ModelsService } from '@server/collections/models/services/models.service';
import type { PrismaService } from '@server/shared/modules/prisma/prisma.service';

type MockModelDelegate = {
  count: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
};

type MockProviderContractDelegate = {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function makeModel(overrides: Record<string, unknown> = {}) {
  return {
    category: ModelCategory.IMAGE,
    config: { owner: 'google' },
    cost: 5,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    id: 'model-1',
    isActive: true,
    isDefault: false,
    isDeleted: false,
    isDiscovered: false,
    lifecycle: ModelLifecycle.AVAILABLE,
    endpoint: 'google/imagen-4',
    key: 'google/imagen-4',
    label: 'Imagen 4',
    organizationId: null,
    provider: ModelProvider.REPLICATE,
    supportsFeatures: [],
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ModelsService', () => {
  let service: ModelsService;
  let modelDelegate: MockModelDelegate;
  let providerContractDelegate: MockProviderContractDelegate;

  beforeEach(() => {
    modelDelegate = {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    };
    providerContractDelegate = {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      update: vi.fn(),
    };

    const transaction = {
      model: modelDelegate,
      modelProviderContract: providerContractDelegate,
    };

    service = new ModelsService(
      {
        $transaction: vi.fn(
          (callback: (client: typeof transaction) => unknown) =>
            callback(transaction),
        ),
        model: modelDelegate,
        modelProviderContract: providerContractDelegate,
        organization: {
          findUnique: vi.fn().mockResolvedValue({
            label: 'Acme Corp',
            slug: 'acme-corp',
          }),
        },
      } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );
  });

  it('stores canonical model fields in columns and provider metadata in config', async () => {
    modelDelegate.create.mockResolvedValue(makeModel());

    const result = await service.create({
      category: ModelCategory.IMAGE,
      cost: 5,
      isDefault: true,
      isDiscovered: true,
      key: 'google/imagen-4',
      label: 'Imagen 4',
      margin: 0.2,
      provider: ModelProvider.REPLICATE,
      providerConfig: { owner: 'google' },
    });

    expect(modelDelegate.create).toHaveBeenCalledWith({
      data: {
        category: ModelCategory.IMAGE,
        config: { owner: 'google' },
        cost: 5,
        isActive: true,
        isDefault: false,
        isDeprecated: false,
        isDiscovered: true,
        isLegacy: false,
        lifecycle: ModelLifecycle.AVAILABLE,
        endpoint: 'google/imagen-4',
        key: 'google/imagen-4',
        label: 'Imagen 4',
        margin: 0.2,
        provider: ModelProvider.REPLICATE,
        succeededBy: null,
      },
    });
    expect(result.providerConfig).toEqual({ owner: 'google' });
  });

  it('requires and validates a successor when creating Legacy', async () => {
    modelDelegate.findFirst.mockResolvedValue(
      makeModel({
        id: 'model-2',
        key: 'google/imagen-5',
        lifecycle: ModelLifecycle.RECOMMENDED,
      }),
    );
    modelDelegate.create.mockResolvedValue(
      makeModel({
        isLegacy: true,
        lifecycle: ModelLifecycle.LEGACY,
        succeededBy: 'google/imagen-5',
      }),
    );

    await service.create({
      category: ModelCategory.IMAGE,
      cost: 5,
      key: 'google/imagen-4',
      label: 'Imagen 4',
      lifecycle: ModelLifecycle.LEGACY,
      provider: ModelProvider.REPLICATE,
      succeededBy: 'google/imagen-5',
    });

    expect(modelDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isActive: true,
        isDefault: false,
        isDeprecated: true,
        isLegacy: true,
        lifecycle: ModelLifecycle.LEGACY,
        succeededBy: 'google/imagen-5',
      }),
    });
  });

  it('queries canonical fields directly', async () => {
    modelDelegate.findFirst.mockResolvedValue(makeModel());

    await service.findOne({ key: 'google/imagen-4' });

    expect(modelDelegate.findFirst).toHaveBeenCalledWith({
      where: { isDeleted: false, key: 'google/imagen-4' },
    });
  });

  it('requires a successor before moving a model to Legacy', async () => {
    modelDelegate.findFirst.mockResolvedValue(makeModel());

    await expect(
      service.transitionLifecycle('model-1', ModelLifecycle.LEGACY),
    ).rejects.toThrow('successor model is required');
    expect(modelDelegate.update).not.toHaveBeenCalled();
  });

  it('keeps Legacy callable and synchronizes compatibility fields', async () => {
    const current = makeModel();
    const successor = makeModel({
      id: 'model-2',
      key: 'google/imagen-5',
      lifecycle: ModelLifecycle.RECOMMENDED,
    });
    modelDelegate.findFirst
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(successor);
    modelDelegate.findUnique.mockResolvedValue(current);
    modelDelegate.update.mockResolvedValue(
      makeModel({
        isDeprecated: true,
        isLegacy: true,
        lifecycle: ModelLifecycle.LEGACY,
        succeededBy: successor.key,
      }),
    );

    await service.transitionLifecycle(
      'model-1',
      ModelLifecycle.LEGACY,
      successor.key,
    );

    expect(modelDelegate.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isActive: true,
        isDefault: false,
        isDeprecated: true,
        isLegacy: true,
        lifecycle: ModelLifecycle.LEGACY,
        succeededBy: successor.key,
      }),
      where: { id: 'model-1' },
    });
  });

  it('touches discovered rows by provider endpoint without crossing providers', async () => {
    const lastSyncedAt = new Date('2026-08-20T12:00:00.000Z');

    await service.touchDiscoveredModels(
      ModelProvider.FAL,
      ['google/nano-banana-2-lite'],
      lastSyncedAt,
    );

    expect(modelDelegate.updateMany).toHaveBeenCalledWith({
      data: { lastSyncedAt },
      where: {
        endpoint: { in: ['google/nano-banana-2-lite'] },
        isDeleted: false,
        isDiscovered: true,
        organizationId: null,
        provider: ModelProvider.FAL,
      },
    });
  });

  it('returns only safe reviewed and pending provider contract details', async () => {
    modelDelegate.findFirst.mockResolvedValue(
      makeModel({
        pendingProviderContractVersion: 'sha256:pending',
        reviewedProviderContractVersion: 'sha256:reviewed',
      }),
    );
    providerContractDelegate.findMany.mockResolvedValue([
      {
        billingUnit: 'seconds',
        conditionalDimensions: { resolution: '768P' },
        currency: 'USD',
        discoveredAt: new Date('2026-09-01T08:00:00.000Z'),
        inputSchema: { properties: { prompt: { type: 'string' } } },
        lastSeenAt: new Date('2026-09-01T09:00:00.000Z'),
        mappingStatus: 'supported',
        openapi: { commerciallySensitive: true },
        outputSchema: { properties: { video: { type: 'object' } } },
        pricing: { accountSpecificRawPayload: true },
        pricingType: 'per-second',
        reviewStatus: 'approved',
        schemaFamily: 'video-text-v1',
        unitPrice: '0.08',
        unsupportedReason: null,
        version: 'sha256:reviewed',
      },
      {
        billingUnit: 'seconds',
        conditionalDimensions: {},
        currency: 'USD',
        discoveredAt: new Date('2026-09-01T10:00:00.000Z'),
        inputSchema: { properties: { duration: { maximum: 15 } } },
        lastSeenAt: new Date('2026-09-01T10:00:00.000Z'),
        mappingStatus: 'supported',
        outputSchema: { type: 'object' },
        pricingType: 'per-second',
        reviewStatus: 'pending',
        schemaFamily: 'video-text-v1',
        unitPrice: '0.08',
        unsupportedReason: null,
        version: 'sha256:pending',
      },
    ]);

    const result = await service.getProviderContracts('model-1');

    expect(providerContractDelegate.findMany).toHaveBeenCalledWith({
      where: {
        modelId: 'model-1',
        version: { in: ['sha256:reviewed', 'sha256:pending'] },
      },
    });
    expect(result).toMatchObject({
      endpoint: 'google/imagen-4',
      pending: { version: 'sha256:pending' },
      provider: ModelProvider.REPLICATE,
      reviewed: {
        inputSchema: { properties: { prompt: { type: 'string' } } },
        unitPrice: '0.08',
        version: 'sha256:reviewed',
      },
    });
    expect(result?.reviewed).not.toHaveProperty('openapi');
    expect(result?.reviewed).not.toHaveProperty('pricing');
  });

  it('filters, sorts, and paginates in Prisma', async () => {
    modelDelegate.findMany.mockResolvedValue([makeModel()]);
    modelDelegate.count.mockResolvedValue(1);

    const result = await service.findAll(
      { where: { category: ModelCategory.IMAGE } },
      { limit: 10, page: 1, pagination: true },
    );

    expect(modelDelegate.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 10,
      where: { category: ModelCategory.IMAGE },
    });
    expect(modelDelegate.count).toHaveBeenCalledWith({
      where: { category: ModelCategory.IMAGE },
    });
    expect(result.totalDocs).toBe(1);
  });

  it('reads the public catalog through a narrow, platform-only projection', async () => {
    modelDelegate.findMany.mockResolvedValue([
      makeModel({
        capabilities: ['text-to-image'],
        isHighlighted: true,
        providerCostUsd: 0.01,
      }),
    ]);
    modelDelegate.count.mockResolvedValue(1);

    const result = await service.findPublicCatalog(
      { category: ModelCategory.IMAGE },
      { limit: 100, page: 1, pagination: true },
    );

    expect(modelDelegate.findMany).toHaveBeenCalledWith({
      orderBy: [
        { isHighlighted: 'desc' },
        { isDefault: 'desc' },
        { label: 'asc' },
      ],
      select: expect.objectContaining({
        capabilities: true,
        category: true,
        id: true,
        isHighlighted: true,
        key: true,
        label: true,
        providerCostUsd: true,
      }),
      skip: 0,
      take: 100,
      where: {
        category: ModelCategory.IMAGE,
        isActive: true,
        isDeleted: false,
        isLegacy: false,
        isPublic: true,
        organizationId: null,
      },
    });
    const findManyArgs = modelDelegate.findMany.mock.calls[0]?.[0];
    if (!findManyArgs) {
      throw new Error('Expected public catalog query');
    }
    expect(findManyArgs.select).not.toHaveProperty('endpoint');
    expect(findManyArgs.select).not.toHaveProperty('providerConfig');
    expect(findManyArgs.select).not.toHaveProperty('providerSyncStatus');
    expect(result.docs[0]).not.toHaveProperty('providerCostUsd');
    expect(result.totalDocs).toBe(1);
  });

  it('clears only competing defaults in the same registry scope', async () => {
    modelDelegate.updateMany.mockResolvedValue({ count: 1 });

    await service.clearOtherDefaults(
      ModelCategory.IMAGE,
      'org-1',
      'selected-model',
    );

    expect(modelDelegate.updateMany).toHaveBeenCalledWith({
      data: { isDefault: false },
      where: {
        category: ModelCategory.IMAGE,
        id: { not: 'selected-model' },
        isDefault: true,
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('rejects bulk updates without an explicit organization scope', async () => {
    await expect(
      service.patchAll({ category: ModelCategory.IMAGE }, { isDefault: false }),
    ).rejects.toMatchObject({
      response: {
        detail: 'organizationId is required for bulk model updates',
        title: 'Validation Error',
      },
    });

    expect(modelDelegate.updateMany).not.toHaveBeenCalled();
  });

  // `normalizeWhere` drops `undefined`, so a present-but-undefined scope widens
  // the write exactly like an omitted key and must be rejected the same way.
  it('rejects bulk updates with an undefined organization scope', async () => {
    await expect(
      service.patchAll({ organizationId: undefined }, { isDefault: false }),
    ).rejects.toMatchObject({
      response: {
        detail: 'organizationId is required for bulk model updates',
        title: 'Validation Error',
      },
    });

    expect(modelDelegate.updateMany).not.toHaveBeenCalled();
  });

  it('rejects non-record bulk update filters', async () => {
    await expect(
      service.patchAll([] as never, { isDefault: false }),
    ).rejects.toMatchObject({
      response: {
        detail: 'Filter criteria are required',
        title: 'Validation Error',
      },
    });

    expect(modelDelegate.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a bulk patch that omits the organization scope', async () => {
    await expect(
      service.patchAll({ key: 'google/imagen-4' }, { isDefault: false }),
    ).rejects.toMatchObject({
      response: {
        detail: 'organizationId is required for bulk model updates',
        title: 'Validation Error',
      },
    });

    expect(modelDelegate.updateMany).not.toHaveBeenCalled();
  });

  it('permits a bulk patch scoped to the global registry', async () => {
    modelDelegate.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.patchAll(
      { key: 'google/imagen-4', organizationId: null },
      { isDefault: false },
    );

    expect(modelDelegate.updateMany).toHaveBeenCalledWith({
      data: { isDefault: false },
      where: {
        isDeleted: false,
        key: 'google/imagen-4',
        organizationId: null,
      },
    });
    expect(result).toEqual({ modifiedCount: 2 });
  });

  it('creates a private model from a completed training', async () => {
    modelDelegate.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(
      makeModel({
        id: 'base-model',
        key: 'black-forest-labs/flux-kontext-pro',
        supportsFeatures: ['reference-image'],
      }),
    );
    modelDelegate.create.mockResolvedValue(
      makeModel({
        id: 'trained-model',
        key: 'genfeedai/acme-corp/portrait-lora-v2',
        organizationId: 'org-1',
        parentModelId: 'base-model',
        trainingId: 'training-1',
      }),
    );

    await service.createFromTraining({
      config: {
        baseModel: 'black-forest-labs/flux-kontext-pro',
        model: 'replicate/trained-lora:abc123',
        trigger: 'TOK',
      },
      id: 'training-1',
      label: 'Portrait LoRA V2',
      organizationId: 'org-1',
    } as never);

    expect(modelDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        category: ModelCategory.IMAGE,
        externalId: 'replicate/trained-lora:abc123',
        isPublic: false,
        key: 'genfeedai/acme-corp/portrait-lora-v2',
        organizationId: 'org-1',
        parentModelId: 'base-model',
        provider: ModelProvider.GENFEED_AI,
        supportsFeatures: ['reference-image', 'lora-weights', 'trigger-word'],
        trainingId: 'training-1',
        triggerWord: 'TOK',
      }),
    });
  });

  it('does not duplicate a model for the same training', async () => {
    modelDelegate.findFirst.mockResolvedValue(
      makeModel({ id: 'trained-model', trainingId: 'training-1' }),
    );

    const result = await service.createFromTraining({
      config: {},
      id: 'training-1',
      organizationId: 'org-1',
    } as never);

    expect(result.id).toBe('trained-model');
    expect(modelDelegate.create).not.toHaveBeenCalled();
  });

  it('promotes only a supported pending Fal contract into runtime fields', async () => {
    modelDelegate.findFirst.mockResolvedValue(
      makeModel({
        endpoint: 'fal-ai/modern-image/edit',
        pendingProviderContractVersion: 'sha256:candidate',
        provider: ModelProvider.FAL,
      }),
    );
    providerContractDelegate.findUnique.mockResolvedValue({
      id: 'contract-1',
      inputSchema: { required: ['prompt', 'image_urls'], type: 'object' },
      mappingStatus: 'supported',
      pricingType: 'flat',
      schemaFamily: 'image-edit-multi-v1',
      unitPriceMicros: 25_000n,
      version: 'sha256:candidate',
    });
    modelDelegate.update.mockResolvedValue(
      makeModel({
        providerCostUsd: 0.025,
        reviewedProviderContractVersion: 'sha256:candidate',
      }),
    );

    await service.approveRegistryModel('model-1', {}, 'operator-1');

    expect(modelDelegate.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isActive: true,
        pendingProviderContractVersion: null,
        pricingType: 'flat',
        providerCostUsd: 0.025,
        providerInputSchema: {
          required: ['prompt', 'image_urls'],
          type: 'object',
        },
        providerSchemaFamily: 'image-edit-multi-v1',
        reviewedProviderContractVersion: 'sha256:candidate',
        reviewStatus: 'approved',
      }),
      where: {
        id: 'model-1',
        isDeleted: false,
        organizationId: null,
      },
    });
    expect(modelDelegate.update.mock.calls[0]?.[0].data.config).toEqual({
      owner: 'google',
    });
    expect(providerContractDelegate.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reviewStatus: 'approved',
        reviewedBy: 'operator-1',
      }),
      where: { id: 'contract-1' },
    });
  });

  it('blocks activation of a quarantined Fal contract', async () => {
    modelDelegate.findFirst.mockResolvedValue(
      makeModel({
        endpoint: 'fal-ai/token-priced',
        pendingProviderContractVersion: 'sha256:unsupported',
        provider: ModelProvider.FAL,
      }),
    );
    providerContractDelegate.findUnique.mockResolvedValue({
      id: 'contract-unsupported',
      mappingStatus: 'quarantined',
      pricingType: null,
      schemaFamily: 'image-text-v1',
      unitPriceMicros: null,
      version: 'sha256:unsupported',
    });

    await expect(
      service.approveRegistryModel('model-1', {}, 'operator-1'),
    ).rejects.toThrow('quarantined and cannot be activated');
    expect(modelDelegate.update).not.toHaveBeenCalled();
    expect(providerContractDelegate.update).not.toHaveBeenCalled();
  });

  it('blocks a reviewed Fal schema family that does not match the model category', async () => {
    modelDelegate.findFirst.mockResolvedValue(
      makeModel({
        category: ModelCategory.IMAGE,
        endpoint: 'fal-ai/video-contract-on-image-model',
        pendingProviderContractVersion: 'sha256:wrong-media',
        provider: ModelProvider.FAL,
      }),
    );
    providerContractDelegate.findUnique.mockResolvedValue({
      id: 'contract-wrong-media',
      inputSchema: { required: ['prompt'], type: 'object' },
      mappingStatus: 'supported',
      pricingType: 'per-second',
      schemaFamily: 'video-text-v1',
      unitPriceMicros: 25_000n,
      version: 'sha256:wrong-media',
    });

    await expect(
      service.approveRegistryModel('model-1', {}, 'operator-1'),
    ).rejects.toThrow('does not match the model category');
    expect(modelDelegate.update).not.toHaveBeenCalled();
    expect(providerContractDelegate.update).not.toHaveBeenCalled();
  });

  it('promotes a supported Replicate contract into the reviewed runtime projection', async () => {
    modelDelegate.findFirst.mockResolvedValue(
      makeModel({
        pendingProviderContractVersion: 'sha256:replicate-candidate',
      }),
    );
    providerContractDelegate.findUnique.mockResolvedValue({
      id: 'replicate-contract',
      inputSchema: {
        properties: { prompt: { type: 'string' } },
        required: ['prompt'],
        type: 'object',
      },
      mappingStatus: 'supported',
      pricingType: 'per-request',
      schemaFamily: 'replicate-image-v1',
      unitPriceMicros: 40_000n,
      version: 'sha256:replicate-candidate',
    });
    modelDelegate.update.mockResolvedValue(makeModel());

    await service.approveRegistryModel('model-1', {}, 'operator-1');

    expect(modelDelegate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerCostUsd: 0.04,
          providerInputSchema: expect.objectContaining({
            required: ['prompt'],
          }),
          providerSchemaFamily: 'replicate-image-v1',
          reviewedProviderContractVersion: 'sha256:replicate-candidate',
        }),
      }),
    );
  });

  it('blocks a Replicate contract whose detected category does not match', async () => {
    modelDelegate.findFirst.mockResolvedValue(
      makeModel({
        pendingProviderContractVersion: 'sha256:replicate-video',
      }),
    );
    providerContractDelegate.findUnique.mockResolvedValue({
      id: 'replicate-video-contract',
      inputSchema: { type: 'object' },
      mappingStatus: 'supported',
      pricingType: 'per-second',
      schemaFamily: 'replicate-video-v1',
      unitPriceMicros: 250_000n,
      version: 'sha256:replicate-video',
    });

    await expect(
      service.approveRegistryModel('model-1', {}, 'operator-1'),
    ).rejects.toThrow('does not match the model category');
  });
});
