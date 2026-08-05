vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ModelsService } from '@api/collections/models/services/models.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';

type MockModelDelegate = {
  count: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
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

    service = new ModelsService(
      {
        model: modelDelegate,
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
        isDefault: true,
        isDiscovered: true,
        key: 'google/imagen-4',
        label: 'Imagen 4',
        margin: 0.2,
        provider: ModelProvider.REPLICATE,
      },
    });
    expect(result.providerConfig).toEqual({ owner: 'google' });
  });

  it('queries canonical fields directly', async () => {
    modelDelegate.findFirst.mockResolvedValue(makeModel());

    await service.findOne({ key: 'google/imagen-4' });

    expect(modelDelegate.findFirst).toHaveBeenCalledWith({
      where: { isDeleted: false, key: 'google/imagen-4' },
    });
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
      service.updateMany(
        { category: ModelCategory.IMAGE },
        { isDefault: false },
      ),
    ).rejects.toThrow('organizationId is required for bulk model updates');

    expect(modelDelegate.updateMany).not.toHaveBeenCalled();
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
});
