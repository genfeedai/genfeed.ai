import { PostsService } from '@api/collections/posts/services/posts.service';
import { AnalyticsExportService } from '@api/endpoints/analytics/analytics-export.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('AnalyticsExportService', () => {
  let service: AnalyticsExportService;

  const mockPostsService = {
    findAll: vi.fn(),
  };

  const mockYoutubeService = {
    getMediaAnalytics: vi.fn(),
  };

  const mockTiktokService = {
    getMediaAnalytics: vi.fn(),
  };

  const mockInstagramService = {
    getMediaAnalytics: vi.fn(),
  };

  const mockPinterestService = {
    getMediaAnalytics: vi.fn(),
  };

  const mockTwitterService = {
    getMediaAnalytics: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsExportService,
        { provide: PostsService, useValue: mockPostsService },
        { provide: YoutubeService, useValue: mockYoutubeService },
        { provide: TiktokService, useValue: mockTiktokService },
        { provide: InstagramService, useValue: mockInstagramService },
        { provide: PinterestService, useValue: mockPinterestService },
        { provide: TwitterService, useValue: mockTwitterService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<AnalyticsExportService>(AnalyticsExportService);
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  // ==========================================================================
  // exportData
  // ==========================================================================
  describe('exportData', () => {
    beforeEach(() => {
      mockPostsService.findAll.mockResolvedValue({ docs: [] });
    });

    it('should export CSV format', async () => {
      mockPostsService.findAll.mockResolvedValue({
        docs: [
          {
            id: 'post-1',
            brandId: 'brand-1',
            createdAt: new Date(),
            credential: { platform: CredentialPlatform.YOUTUBE },
            label: 'Test Post',
            metadata: { label: 'Video Title' },
            organizationId: 'org-1',
            status: 'published',
            updatedAt: new Date(),
          },
        ],
      });

      const result = await service.exportData('csv', [
        'id',
        'title',
        'platform',
      ]);

      expect(typeof result).toBe('string');
      expect(result).toContain('id,title,platform');
    });

    it('should export XLSX format', async () => {
      mockPostsService.findAll.mockResolvedValue({
        docs: [
          {
            id: 'post-2',
            brandId: 'brand-1',
            createdAt: new Date(),
            credential: { platform: CredentialPlatform.TIKTOK },
            label: 'Test Post',
            metadata: {},
            organizationId: 'org-1',
            status: 'published',
            updatedAt: new Date(),
          },
        ],
      });

      const result = await service.exportData('xlsx', ['id', 'title']);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should return headers only when no data', async () => {
      mockPostsService.findAll.mockResolvedValue({ docs: [] });

      const result = await service.exportData('csv', [
        'id',
        'title',
        'platform',
      ]);

      expect(result).toBe('id,title,platform');
    });

    it('should fetch platform-specific analytics', async () => {
      const postId = 'post-yt-1';
      const orgId = 'org-1';
      const brandId = 'brand-1';

      mockPostsService.findAll.mockResolvedValue({
        docs: [
          {
            id: postId,
            brandId,
            createdAt: new Date(),
            credential: { platform: CredentialPlatform.YOUTUBE },
            externalId: 'youtube-123',
            label: 'YT Video',
            metadata: {},
            organizationId: orgId,
            status: 'published',
            updatedAt: new Date(),
          },
        ],
      });

      mockYoutubeService.getMediaAnalytics.mockResolvedValue({
        comments: 50,
        likes: 100,
        views: 1000,
      });

      const result = await service.exportData('csv', ['views', 'likes']);

      expect(mockYoutubeService.getMediaAnalytics).toHaveBeenCalledWith(
        orgId,
        brandId,
        'youtube-123',
      );
      expect(result).toContain('1000');
    });

    it('should fetch TikTok analytics', async () => {
      mockPostsService.findAll.mockResolvedValue({
        docs: [
          {
            id: 'post-tt-1',
            brandId: 'brand-1',
            createdAt: new Date(),
            credential: { platform: CredentialPlatform.TIKTOK },
            externalId: 'tiktok-123',
            label: 'TT Video',
            metadata: {},
            organizationId: 'org-1',
            status: 'published',
            updatedAt: new Date(),
          },
        ],
      });

      mockTiktokService.getMediaAnalytics.mockResolvedValue({
        comments: 25,
        likes: 50,
        views: 500,
      });

      await service.exportData('csv', ['views']);

      expect(mockTiktokService.getMediaAnalytics).toHaveBeenCalled();
    });

    it('should handle analytics fetch errors gracefully', async () => {
      mockPostsService.findAll.mockResolvedValue({
        docs: [
          {
            id: 'post-err-1',
            brandId: 'brand-1',
            createdAt: new Date(),
            credential: { platform: CredentialPlatform.INSTAGRAM },
            externalId: 'error-123',
            label: 'Error Video',
            metadata: {},
            organizationId: 'org-1',
            status: 'published',
            updatedAt: new Date(),
          },
        ],
      });

      mockInstagramService.getMediaAnalytics.mockRejectedValue(
        new Error('API Error'),
      );

      // Should not throw
      const result = await service.exportData('csv', ['id', 'views']);

      expect(result).toBeDefined();
      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('should scope PostsService.findAll to the given organizationId', async () => {
      const orgId = 'org-scoped-abc';
      mockPostsService.findAll.mockResolvedValue({ docs: [] });

      await service.exportData('csv', ['id', 'title'], {
        organizationId: orgId,
      });

      expect(mockPostsService.findAll).toHaveBeenCalledWith(
        { where: { status: 'published', organizationId: orgId } },
        {
          limit: 5000,
          page: 1,
          pagination: true,
          sort: '-publicationDate',
        },
      );
    });

    it('should NOT include organizationId filter when no organizationId provided', async () => {
      mockPostsService.findAll.mockResolvedValue({ docs: [] });

      await service.exportData('csv', ['id', 'title']);

      expect(mockPostsService.findAll).toHaveBeenCalledWith(
        { where: { status: 'published' } },
        {
          limit: 5000,
          page: 1,
          pagination: true,
          sort: '-publicationDate',
        },
      );
    });

    it('bounds exports to the requested brand, platform, and date range', async () => {
      mockPostsService.findAll.mockResolvedValue({ docs: [] });

      await service.exportData('csv', ['id'], {
        brandId: 'brand-1',
        endDate: '2026-07-12',
        organizationId: 'org-1',
        platform: 'instagram',
        postId: 'post-1',
        startDate: '2026-07-01',
      });

      expect(mockPostsService.findAll).toHaveBeenCalledWith(
        {
          where: {
            brandId: 'brand-1',
            organizationId: 'org-1',
            platform: 'instagram',
            id: 'post-1',
            publicationDate: {
              gte: new Date('2026-07-01T00:00:00.000Z'),
              lte: new Date('2026-07-12T23:59:59.999Z'),
            },
            status: 'published',
          },
        },
        {
          limit: 5000,
          page: 1,
          pagination: true,
          sort: '-publicationDate',
        },
      );
    });

    it('rejects export ranges larger than one year', async () => {
      await expect(
        service.exportData('csv', ['id'], {
          endDate: '2026-07-12',
          startDate: '2025-07-11',
        }),
      ).rejects.toThrow('Analytics exports support at most 366 days');

      expect(mockPostsService.findAll).not.toHaveBeenCalled();
    });

    it('rejects unknown export fields before querying posts', async () => {
      await expect(service.exportData('xlsx', ['__proto__'])).rejects.toThrow(
        'Invalid analytics export fields',
      );

      expect(mockPostsService.findAll).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // exportVideoStatsCsv
  // ==========================================================================
  describe('exportVideoStatsCsv', () => {
    it('should return CSV with video stats fields', async () => {
      mockPostsService.findAll.mockResolvedValue({
        docs: [
          {
            id: 'post-1',
            brandId: 'brand-1',
            createdAt: new Date(),
            credential: { platform: CredentialPlatform.YOUTUBE },
            externalId: 'yt-123',
            label: 'Video 1',
            metadata: { label: 'Test Video' },
            organizationId: 'org-1',
            status: 'published',
            updatedAt: new Date(),
            views: 100,
          },
        ],
      });

      mockYoutubeService.getMediaAnalytics.mockResolvedValue({
        comments: 25,
        likes: 50,
        views: 500,
      });

      const result = await service.exportVideoStatsCsv();

      expect(result).toContain('videoLabel,views,comments,likes,platform');
    });
  });
});
