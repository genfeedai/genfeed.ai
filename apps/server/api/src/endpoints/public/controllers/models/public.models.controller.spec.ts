import { ModelsService } from '@api/collections/models/services/models.service';
import { PublicModelsController } from '@api/endpoints/public/controllers/models/public.models.controller';
import { PublicModelsQueryDto } from '@api/endpoints/public/dto/public-models-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request as ExpressRequest } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
  setTopLinks: vi.fn((_req, opts) => opts),
}));

vi.mock('@genfeedai/serializers', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/serializers')>();
  return {
    ...actual,
    ModelCatalogSerializer: {
      opts: {},
      serialize: vi.fn((data) => data),
    },
  };
});

describe('PublicModelsController', () => {
  let controller: PublicModelsController;
  let modelsService: vi.Mocked<ModelsService>;

  const mockRequest = {
    originalUrl: '/v1/public/models',
    query: {},
  } as unknown as ExpressRequest;

  const mockCatalog = {
    docs: [
      { id: 'model-1', key: 'fal-ai/flux/dev', label: 'FLUX.1 [dev]' },
      { id: 'model-2', key: 'black-forest-labs/flux-pro', label: 'FLUX Pro' },
    ],
    page: 1,
    totalDocs: 2,
  } as unknown as Awaited<ReturnType<ModelsService['findPublicCatalog']>>;

  function filtersFromLastCall(): Record<string, unknown> {
    const filters = modelsService.findPublicCatalog.mock.calls[0]?.[0];
    if (!filters) {
      throw new Error('Expected public catalog query');
    }
    return { ...filters };
  }

  function buildQuery(
    overrides: Partial<PublicModelsQueryDto> = {},
  ): PublicModelsQueryDto {
    return { limit: 50, page: 1, ...overrides } as PublicModelsQueryDto;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicModelsController],
      providers: [
        {
          provide: ModelsService,
          useValue: {
            findPublicCatalog: vi.fn().mockResolvedValue(mockCatalog),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PublicModelsController>(PublicModelsController);
    modelsService = module.get(ModelsService);

    vi.clearAllMocks();
    modelsService.findPublicCatalog.mockResolvedValue(mockCatalog);
  });

  describe('findPublicModels', () => {
    it('returns the serialized catalog', async () => {
      const result = await controller.findPublicModels(
        mockRequest,
        buildQuery(),
      );

      expect(modelsService.findPublicCatalog).toHaveBeenCalled();
      expect(result).toEqual({ data: mockCatalog.docs });
    });

    it('filters by category when provided', async () => {
      await controller.findPublicModels(
        mockRequest,
        buildQuery({ category: ModelCategory.VIDEO }),
      );

      expect(filtersFromLastCall().category).toBe(ModelCategory.VIDEO);
    });

    it('filters by provider when provided', async () => {
      await controller.findPublicModels(
        mockRequest,
        buildQuery({ provider: ModelProvider.FAL }),
      );

      expect(filtersFromLastCall().provider).toBe(ModelProvider.FAL);
    });
  });
});
