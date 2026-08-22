import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ContentRunsController } from '@api/collections/content-runs/controllers/content-runs.controller';
import { CreateBrandRemixRunDto } from '@api/collections/content-runs/dto/brand-remix-run.dto';
import { BrandRemixRunsService } from '@api/collections/content-runs/services/brand-remix-runs.service';
import { ContentRunRecommendationsService } from '@api/collections/content-runs/services/content-run-recommendations.service';
import { ContentRunsService } from '@api/collections/content-runs/services/content-runs.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ContentRunStatus } from '@genfeedai/enums';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

describe('ContentRunsController', () => {
  let controller: ContentRunsController;

  const mockService = {
    createBriefRun: vi.fn(),
    createRemixPack: vi.fn(),
    getRunById: vi.fn(),
    listByBrand: vi.fn(),
  };
  const mockRecommendationsService = {
    analyzeRun: vi.fn(),
  };
  const mockBrandRemixRunsService = {
    create: vi.fn(),
    get: vi.fn(),
    preparePausedMetaDraft: vi.fn(),
    revise: vi.fn(),
    start: vi.fn(),
    submitForReview: vi.fn(),
  };

  const mockReq = { headers: {}, url: '/' } as unknown as Request;
  const mockUser = {
    id: 'user-1',
    isSuperAdmin: false,
    organizationId: 'org-1',
    userId: 'user-1',
  } as User;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentRunsController],
      providers: [
        {
          provide: ContentRunsService,
          useValue: mockService,
        },
        {
          provide: ContentRunRecommendationsService,
          useValue: mockRecommendationsService,
        },
        {
          provide: BrandRemixRunsService,
          useValue: mockBrandRemixRunsService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_context: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    controller = module.get(ContentRunsController);
  });

  it('does not declare a controller-level v1 prefix', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ContentRunsController)).not.toBe(
      'v1',
    );
  });

  describe('listBrandRuns', () => {
    it('lists runs scoped to org and brand', async () => {
      mockService.listByBrand.mockResolvedValue([]);

      await controller.listBrandRuns(
        mockReq,
        'brand-1',
        mockUser,
        undefined,
        undefined,
      );

      expect(mockService.listByBrand).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        undefined,
        undefined,
      );
    });

    it('passes skillSlug filter', async () => {
      mockService.listByBrand.mockResolvedValue([]);

      await controller.listBrandRuns(
        mockReq,
        'brand-1',
        mockUser,
        'content-writing',
        undefined,
      );

      expect(mockService.listByBrand).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'content-writing',
        undefined,
      );
    });

    it('passes status filter', async () => {
      mockService.listByBrand.mockResolvedValue([]);

      await controller.listBrandRuns(
        mockReq,
        'brand-1',
        mockUser,
        undefined,
        ContentRunStatus.COMPLETED,
      );

      expect(mockService.listByBrand).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        undefined,
        ContentRunStatus.COMPLETED,
      );
    });

    it('passes both skillSlug and status filters', async () => {
      mockService.listByBrand.mockResolvedValue([]);

      await controller.listBrandRuns(
        mockReq,
        'brand-1',
        mockUser,
        'image-gen',
        ContentRunStatus.FAILED,
      );

      expect(mockService.listByBrand).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'image-gen',
        ContentRunStatus.FAILED,
      );
    });
  });

  describe('getRun', () => {
    it('gets a run by id scoped to org', async () => {
      mockService.getRunById.mockResolvedValue({
        id: 'run-1',
        status: 'completed',
      });

      await controller.getRun(mockReq, 'run-1', mockUser);

      expect(mockService.getRunById).toHaveBeenCalledWith('org-1', 'run-1');
    });

    it('uses organization from the authenticated user', async () => {
      mockService.getRunById.mockResolvedValue({ id: 'run-1' });

      await controller.getRun(mockReq, 'run-1', {
        ...mockUser,
        organizationId: 'org-different',
      });

      expect(mockService.getRunById).toHaveBeenCalledWith(
        'org-different',
        'run-1',
      );
    });

    it('returns null when run not found', async () => {
      mockService.getRunById.mockResolvedValue(null);

      await controller.getRun(mockReq, 'nonexistent', mockUser);

      expect(mockService.getRunById).toHaveBeenCalledWith(
        'org-1',
        'nonexistent',
      );
    });

    it('propagates service errors', async () => {
      mockService.getRunById.mockRejectedValue(new Error('DB error'));

      await expect(
        controller.getRun(mockReq, 'run-1', mockUser),
      ).rejects.toThrow('DB error');
    });
  });

  describe('createBriefRun', () => {
    it('creates a research brief run scoped to org and brand', async () => {
      const body = {
        evidence: ['Source text'],
        platform: 'twitter',
        sourceUrl: 'https://x.com/builderx/status/1',
        title: 'AI agents in workflows',
        trendId: 'trend-1',
        trendTopic: '#AIAgents',
      };
      mockService.createBriefRun.mockResolvedValue({
        id: 'run-1',
        brief: { evidence: ['Source text'] },
        status: ContentRunStatus.PENDING,
      });

      await controller.createBriefRun(mockReq, 'brand-1', mockUser, body);

      expect(mockService.createBriefRun).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        body,
      );
    });
  });

  describe('brand remix runs', () => {
    it('creates a server-prefilled remix scoped to the route brand', async () => {
      const body: CreateBrandRemixRunDto = {
        source: { kind: 'source_post', sourcePostId: 'source-post-1' },
      };
      mockBrandRemixRunsService.create.mockResolvedValue({ id: 'run-1' });

      await controller.createBrandRemixRun(mockReq, 'brand-1', mockUser, body);

      expect(mockBrandRemixRunsService.create).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        body,
      );
    });

    it('starts generation with the authenticated user and request context', async () => {
      mockBrandRemixRunsService.start.mockResolvedValue({ id: 'run-1' });

      await controller.startBrandRemixRun(mockReq, 'run-1', mockUser, {
        expectedRevision: 1,
      });

      expect(mockBrandRemixRunsService.start).toHaveBeenCalledWith(
        'org-1',
        'run-1',
        mockUser,
        mockReq,
        { expectedRevision: 1 },
      );
    });

    it('hands selected variants to Review using the canonical user id', async () => {
      mockBrandRemixRunsService.submitForReview.mockResolvedValue({
        id: 'run-1',
      });

      await controller.submitBrandRemixRunForReview(
        mockReq,
        'run-1',
        mockUser,
        { variantIds: ['variant-1'] },
      );

      expect(mockBrandRemixRunsService.submitForReview).toHaveBeenCalledWith(
        'org-1',
        'run-1',
        'user-1',
        { variantIds: ['variant-1'] },
      );
    });
  });

  describe('analyzeRunRecommendations', () => {
    it('computes recommendations and returns the updated run', async () => {
      mockRecommendationsService.analyzeRun.mockResolvedValue({
        updatedRun: {
          id: 'run-1',
          analyticsSummary: { winningVariantId: 'variant-a' },
          recommendations: [{ metadata: {}, type: 'extend_winner_format' }],
        },
      });

      await controller.analyzeRunRecommendations(mockReq, 'run-1', mockUser);

      expect(mockRecommendationsService.analyzeRun).toHaveBeenCalledWith(
        'org-1',
        'run-1',
      );
    });
  });

  describe('createRemixPack', () => {
    it('creates remix variants scoped to the authenticated organization', async () => {
      mockService.createRemixPack.mockResolvedValue({
        id: 'run-1',
        variants: [{ id: 'post-thread', metadata: {}, type: 'text' }],
      });

      await controller.createRemixPack(mockReq, 'run-1', mockUser);

      expect(mockService.createRemixPack).toHaveBeenCalledWith(
        'org-1',
        'run-1',
      );
    });
  });
});
