import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import {
  AnalyticsSocialProcessor,
  type SocialAnalyticsJobData,
} from '@api/queues/analytics-social/analytics-social.processor';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AnalyticsSocialProcessor', () => {
  let processor: AnalyticsSocialProcessor;
  let instagramService: InstagramService;
  let tiktokService: TiktokService;
  let pinterestService: PinterestService;
  let postAnalyticsService: PostAnalyticsService;
  let postsService: PostsService;
  let logger: LoggerService;

  beforeEach(() => {
    instagramService = {
      getMediaAnalytics: vi.fn(),
    } as any;

    tiktokService = {
      getMediaAnalytics: vi.fn(),
    } as any;

    pinterestService = {
      getMediaAnalytics: vi.fn(),
    } as any;

    postAnalyticsService = {
      processInstagramAnalytics: vi.fn(),
      processPinterestAnalytics: vi.fn(),
      processTikTokAnalytics: vi.fn(),
    } as any;

    postsService = {
      patch: vi.fn(),
    } as any;

    logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as any;

    processor = new AnalyticsSocialProcessor(
      instagramService,
      tiktokService,
      pinterestService,
      postAnalyticsService,
      postsService,
      logger,
    );
  });

  describe('instantiation', () => {
    it('should be defined', () => {
      expect(processor).toBeDefined();
    });
  });

  describe('process', () => {
    it('should process social analytics for multiple posts', async () => {
      const jobData: SocialAnalyticsJobData = {
        posts: [
          {
            _id: 'post-1',
            brand: 'brand-1',
            externalId: 'ig-123',
            organization: 'org-1',
            platform: CredentialPlatform.INSTAGRAM,
          },
          {
            _id: 'post-2',
            brand: 'brand-1',
            externalId: 'tiktok-456',
            organization: 'org-1',
            platform: CredentialPlatform.TIKTOK,
          },
        ],
      };

      const job = {
        data: jobData,
        id: 'job-1',
        updateProgress: vi.fn(),
      } as unknown as Job<SocialAnalyticsJobData>;

      await processor.process(job);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Processing social media analytics'),
      );
      expect(job.updateProgress).toHaveBeenCalled();
    });

    it('should handle empty posts array', async () => {
      const jobData: SocialAnalyticsJobData = {
        posts: [],
      };

      const job = {
        data: jobData,
        id: 'job-2',
        updateProgress: vi.fn(),
      } as unknown as Job<SocialAnalyticsJobData>;

      await processor.process(job);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No posts provided'),
      );
    });

    it('should group posts by platform', async () => {
      const jobData: SocialAnalyticsJobData = {
        posts: [
          {
            _id: 'post-1',
            brand: 'brand-1',
            externalId: 'ig-1',
            organization: 'org-1',
            platform: CredentialPlatform.INSTAGRAM,
          },
          {
            _id: 'post-2',
            brand: 'brand-1',
            externalId: 'ig-2',
            organization: 'org-1',
            platform: CredentialPlatform.INSTAGRAM,
          },
          {
            _id: 'post-3',
            brand: 'brand-1',
            externalId: 'tt-1',
            organization: 'org-1',
            platform: CredentialPlatform.TIKTOK,
          },
        ],
      };

      const job = {
        data: jobData,
        id: 'job-3',
        updateProgress: vi.fn(),
      } as unknown as Job<SocialAnalyticsJobData>;

      await processor.process(job);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('3 posts'),
      );
    });

    it('should handle circuit breaker errors', async () => {
      const jobData: SocialAnalyticsJobData = {
        posts: [
          {
            _id: 'post-1',
            brand: 'brand-1',
            externalId: 'ig-123',
            organization: 'org-1',
            platform: CredentialPlatform.INSTAGRAM,
          },
        ],
      };

      const job = {
        data: jobData,
        id: 'job-4',
        updateProgress: vi.fn(),
      } as unknown as Job<SocialAnalyticsJobData>;

      // Mock a service failure — errors are caught per-post, not thrown
      vi.mocked(instagramService.getMediaAnalytics).mockRejectedValue(
        new Error('Service unavailable'),
      );

      await processor.process(job);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle individual post processing errors gracefully', async () => {
      const jobData: SocialAnalyticsJobData = {
        posts: [
          {
            _id: 'post-good',
            brand: 'brand-1',
            externalId: 'ig-good',
            organization: 'org-1',
            platform: CredentialPlatform.INSTAGRAM,
          },
          {
            _id: 'post-bad',
            brand: 'brand-1',
            externalId: 'ig-bad',
            organization: 'org-1',
            platform: CredentialPlatform.INSTAGRAM,
          },
        ],
      };

      const job = {
        data: jobData,
        id: 'job-5',
        updateProgress: vi.fn(),
      } as unknown as Job<SocialAnalyticsJobData>;

      await processor.process(job);

      expect(logger.log).toHaveBeenCalled();
    });
  });
});
