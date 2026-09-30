import { DocsController } from '@api/endpoints/docs/docs.controller';
import { DocsService } from '@api/endpoints/docs/docs.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { Test, TestingModule } from '@nestjs/testing';

describe('DocsController', () => {
  let controller: DocsController;
  let docsService: vi.Mocked<DocsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocsController],
      providers: [
        {
          provide: DocsService,
          useValue: {
            getGptActionsSpec: vi.fn(),
            getOpenApiDocument: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DocsController>(DocsController);
    docsService = module.get(DocsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getOpenApiSpec', () => {
    it('should return OpenAPI specification', async () => {
      const mockOpenApiDoc = {
        info: {
          title: 'GenFeed API',
          version: '1.0.0',
        },
        openapi: '3.0.0',
        paths: {
          '/v1/test': {
            get: {
              description: 'Test endpoint',
              responses: {
                '200': {
                  description: 'Success',
                },
              },
            },
          },
        },
      };

      docsService.getOpenApiDocument.mockReturnValue(mockOpenApiDoc as never);

      const result = await controller.getOpenApiSpec();

      expect(docsService.getOpenApiDocument).toHaveBeenCalled();
      expect(result).toEqual(mockOpenApiDoc);
      expect(result.openapi).toBe('3.0.0');
      expect(result.info.title).toBe('GenFeed API');
    });

    it('should return specification with paths', async () => {
      const mockOpenApiDoc = {
        components: {},
        info: {
          title: 'API',
          version: '1.0.0',
        },
        openapi: '3.0.0',
        paths: {
          '/v1/brands': { get: {}, post: {} },
          '/v1/posts': { get: {}, post: {} },
        },
      };

      docsService.getOpenApiDocument.mockReturnValue(mockOpenApiDoc as never);

      const result = await controller.getOpenApiSpec();

      expect(Object.keys(result.paths)).toContain('/v1/brands');
      expect(Object.keys(result.paths)).toContain('/v1/posts');
    });
  });

  describe('getGptActionsSpec', () => {
    it('should return GPT Actions specification', async () => {
      const mockGptActionsSpec = {
        info: {
          title: 'GenFeed GPT Actions',
          version: '1.0.0',
        },
        openapi: '3.1.0',
        paths: {
          '/v1/ai/generate': {
            post: {
              description: 'Generate content with AI',
              operationId: 'generateContent',
            },
          },
        },
      };

      docsService.getGptActionsSpec.mockReturnValue(
        mockGptActionsSpec as never,
      );

      const result = await controller.getGptActionsSpec();

      expect(docsService.getGptActionsSpec).toHaveBeenCalled();
      expect(result).toEqual(mockGptActionsSpec);
      expect(result.info.title).toBe('GenFeed GPT Actions');
    });

    it('should return spec with operation IDs', async () => {
      const mockGptActionsSpec = {
        info: {
          title: 'GPT Actions',
          version: '1.0.0',
        },
        openapi: '3.1.0',
        paths: {
          '/v1/action1': {
            post: {
              operationId: 'action1',
            },
          },
          '/v1/action2': {
            post: {
              operationId: 'action2',
            },
          },
        },
      };

      docsService.getGptActionsSpec.mockReturnValue(
        mockGptActionsSpec as never,
      );

      const result = await controller.getGptActionsSpec();

      const operations = Object.values(result.paths).map(
        (p: never) => p.post?.operationId,
      );
      expect(operations).toContain('action1');
      expect(operations).toContain('action2');
    });

    it('should handle empty paths', async () => {
      const mockGptActionsSpec = {
        info: {
          title: 'GPT Actions',
          version: '1.0.0',
        },
        openapi: '3.1.0',
        paths: {},
      };

      docsService.getGptActionsSpec.mockReturnValue(
        mockGptActionsSpec as never,
      );

      const result = await controller.getGptActionsSpec();

      expect(result.paths).toEqual({});
    });
  });
});
