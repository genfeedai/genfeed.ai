import { CreativePatternsController } from '@api/collections/creative-patterns/controllers/creative-patterns.controller';
import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { buildPaginatedResult } from '@api/helpers/utils/paginated-result/paginated-result.util';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const currentUser = {
  organizationId: 'org-1',
} as never;

const request = {
  originalUrl: '/v1/creative-patterns?page=2&limit=2',
} as Request;

describe('CreativePatternsController', () => {
  let controller: CreativePatternsController;

  const mockPatterns = [
    {
      avgPerformanceScore: 8,
      id: 'pattern-1',
      label: 'Curiosity hook',
      patternType: 'hook_formula',
      platform: 'twitter',
    },
    {
      avgPerformanceScore: 5,
      id: 'pattern-2',
      label: 'Direct CTA',
      patternType: 'cta_formula',
      platform: 'instagram',
    },
  ];

  const mockCreativePatternsService = {
    findAll: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CreativePatternsController],
      providers: [
        {
          provide: CreativePatternsService,
          useValue: mockCreativePatternsService,
        },
      ],
    }).compile();

    controller = module.get<CreativePatternsController>(
      CreativePatternsController,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('rejects a session without an organization', async () => {
      await expect(
        controller.findAll(request, { organizationId: '' } as never, {
          limit: 20,
          page: 1,
        }),
      ).rejects.toThrow('organizationId is required');
      expect(mockCreativePatternsService.findAll).not.toHaveBeenCalled();
    });

    it('pages the organization list and passes the filters through', async () => {
      mockCreativePatternsService.findAll.mockResolvedValue(
        buildPaginatedResult(mockPatterns, 5, 2, 2),
      );

      await controller.findAll(request, currentUser, {
        brandId: 'brand123',
        limit: 2,
        page: 2,
        patternType: 'hook_formula',
        platform: 'twitter',
        scope: 'public',
      });

      expect(mockCreativePatternsService.findAll).toHaveBeenCalledWith(
        {
          brandId: 'brand123',
          organizationId: 'org-1',
          patternType: 'hook_formula',
          platform: 'twitter',
          scope: 'public',
        },
        { limit: 2, page: 2 },
      );
    });

    it('serializes the page as JSON:API with pagination links', async () => {
      mockCreativePatternsService.findAll.mockResolvedValue(
        buildPaginatedResult(mockPatterns, 5, 2, 2),
      );

      const result = await controller.findAll(request, currentUser, {
        limit: 2,
        page: 2,
      });

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({
        attributes: { label: 'Curiosity hook', patternType: 'hook_formula' },
        id: 'pattern-1',
        type: 'creative-pattern',
      });
      expect(result.links).toMatchObject({
        pagination: { limit: 2, page: 2, pages: 3, total: 5 },
        self: '/v1/creative-patterns?page=2&limit=2',
      });
    });
  });
});
