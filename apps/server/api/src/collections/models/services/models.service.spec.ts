import { ModelsService } from '@api/collections/models/services/models.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';

type MockModelDelegate = {
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function makeModel(overrides: Record<string, unknown> = {}) {
  return {
    config: {
      category: ModelCategory.IMAGE,
      cost: 5,
      isDefault: false,
      key: 'google/imagen-4',
      provider: ModelProvider.REPLICATE,
    },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    id: 'model-1',
    isActive: true,
    isDeleted: false,
    label: 'Imagen 4',
    organizationId: null,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ModelsService', () => {
  let service: ModelsService;
  let modelDelegate: MockModelDelegate;

  beforeEach(() => {
    modelDelegate = {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
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

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates models by packing dynamic registry fields into config', async () => {
    const created = makeModel();
    modelDelegate.create.mockResolvedValue(created);

    await service.create({
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
        config: {
          category: ModelCategory.IMAGE,
          cost: 5,
          isDefault: true,
          isDiscovered: true,
          key: 'google/imagen-4',
          margin: 0.2,
          provider: ModelProvider.REPLICATE,
          providerConfig: { owner: 'google' },
        },
        label: 'Imagen 4',
      },
    });
  });

  it('finds models by dynamic key stored in config', async () => {
    modelDelegate.findMany.mockResolvedValue([
      makeModel({
        config: { key: 'google/veo-3.1', category: ModelCategory.VIDEO },
        id: 'model-video',
      }),
      makeModel(),
    ]);

    const result = await service.findOne({ key: 'google/imagen-4' });

    expect(result?._id).toBe('model-1');
    expect(result?.key).toBe('google/imagen-4');
  });

  it('filters and paginates dynamic config fields in findAll', async () => {
    modelDelegate.findMany.mockResolvedValue([
      makeModel({
        config: { category: ModelCategory.VIDEO, key: 'google/veo-3.1' },
        id: 'model-video',
      }),
      makeModel(),
    ]);

    const result = await service.findAll(
      { where: { category: ModelCategory.IMAGE } },
      { limit: 10, page: 1, pagination: true },
    );

    expect(result.totalDocs).toBe(1);
    expect(result.docs[0]?.key).toBe('google/imagen-4');
  });

  it('updates dynamic config fields without dropping existing config', async () => {
    modelDelegate.findMany.mockResolvedValue([
      makeModel({
        config: {
          category: ModelCategory.IMAGE,
          key: 'google/imagen-4',
          provider: ModelProvider.REPLICATE,
        },
      }),
    ]);
    modelDelegate.update.mockResolvedValue(makeModel());

    await service.updateMany(
      { category: ModelCategory.IMAGE },
      { isDefault: false },
    );

    expect(modelDelegate.update).toHaveBeenCalledWith({
      data: {
        config: {
          category: ModelCategory.IMAGE,
          isDefault: false,
          key: 'google/imagen-4',
          provider: ModelProvider.REPLICATE,
        },
      },
      where: { id: 'model-1' },
    });
  });

  it('returns enabled org-scoped models from findAvailableModels', async () => {
    modelDelegate.findMany.mockResolvedValue([
      makeModel({ id: 'system-model', organizationId: null }),
      makeModel({
        config: { category: ModelCategory.IMAGE, key: 'custom/lora' },
        id: 'private-model',
        organizationId: 'org-1',
      }),
      makeModel({
        config: { category: ModelCategory.IMAGE, key: 'foreign/lora' },
        id: 'foreign-model',
        organizationId: 'org-2',
      }),
    ]);

    const result = await service.findAvailableModels({
      enabledModelIds: ['private-model'],
      organizationId: 'org-1',
    });

    expect(modelDelegate.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ organizationId: null }, { organizationId: 'org-1' }],
        isActive: true,
        isDeleted: false,
      },
    });
    expect(result.map((model) => model._id)).toEqual(['private-model']);
  });

  it('creates a private LoRA model from a completed training', async () => {
    modelDelegate.findFirst.mockResolvedValue(null);
    modelDelegate.findMany.mockResolvedValue([
      makeModel({
        config: {
          category: ModelCategory.IMAGE,
          key: 'black-forest-labs/flux-kontext-pro',
          supportsFeatures: ['reference-image'],
        },
        id: 'base-model',
      }),
    ]);
    modelDelegate.create.mockResolvedValue(
      makeModel({
        config: {
          key: 'genfeedai/acme-corp/portrait-lora-v2',
          parentModel: 'base-model',
          provider: ModelProvider.GENFEED_AI,
          supportsFeatures: ['reference-image', 'lora-weights', 'trigger-word'],
          training: 'training-1',
          triggerWord: 'TOK',
        },
        id: 'trained-model',
        organizationId: 'org-1',
        parentModelId: 'base-model',
        trainingId: 'training-1',
      }),
    );

    await service.createFromTraining({
      _id: 'training-1',
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
      data: {
        config: expect.objectContaining({
          isPublic: false,
          key: 'genfeedai/acme-corp/portrait-lora-v2',
          provider: ModelProvider.GENFEED_AI,
          supportsFeatures: ['reference-image', 'lora-weights', 'trigger-word'],
          training: 'training-1',
          triggerWord: 'TOK',
        }),
        externalId: 'replicate/trained-lora:abc123',
        isActive: true,
        label: 'Portrait LoRA V2',
        organizationId: 'org-1',
        parentModelId: 'base-model',
        trainingId: 'training-1',
      },
    });
  });

  it('does not create a duplicate model for the same training', async () => {
    const existing = makeModel({
      id: 'trained-model',
      trainingId: 'training-1',
    });
    modelDelegate.findFirst.mockResolvedValue(existing);

    const result = await service.createFromTraining({
      _id: 'training-1',
      config: {},
      id: 'training-1',
      organizationId: 'org-1',
    } as never);

    expect(result._id).toBe('trained-model');
    expect(modelDelegate.create).not.toHaveBeenCalled();
  });
});
