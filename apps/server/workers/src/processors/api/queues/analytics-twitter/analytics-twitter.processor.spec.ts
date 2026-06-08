import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';

import {
  AnalyticsTwitterProcessor,
  type TwitterAnalyticsJobData,
} from './analytics-twitter.processor';

const makeJob = (
  data: Partial<TwitterAnalyticsJobData> = {},
): Job<TwitterAnalyticsJobData> =>
  ({
    data: {
      credentialId: 'cred_123',
      posts: [],
      ...data,
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  }) as unknown as Job<TwitterAnalyticsJobData>;

describe('AnalyticsTwitterProcessor', () => {
  let processor: AnalyticsTwitterProcessor;
  let twitterService: vi.Mocked<TwitterService>;
  let postAnalyticsService: vi.Mocked<PostAnalyticsService>;
  let credentialsService: vi.Mocked<CredentialsService>;
  let logger: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsTwitterProcessor,
        {
          provide: TwitterService,
          useValue: {
            getMediaAnalyticsBatch: vi.fn(),
          },
        },
        {
          provide: PostAnalyticsService,
          useValue: {
            processTwitterAnalytics: vi.fn(),
          },
        },
        {
          provide: CredentialsService,
          useValue: {
            findOne: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    processor = module.get<AnalyticsTwitterProcessor>(
      AnalyticsTwitterProcessor,
    );
    twitterService = module.get(TwitterService);
    postAnalyticsService = module.get(PostAnalyticsService);
    credentialsService = module.get(CredentialsService);
    logger = module.get(LoggerService);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  // ── process: happy path ──────────────────────────────────────────────────
  describe('process (happy path)', () => {
    it('processes a batch of posts successfully', async () => {
      const posts = [
        {
          _id: 'post_1',
          brand: 'brand_1',
          externalId: 'tweet_111',
          organization: 'org_1',
        },
        {
          _id: 'post_2',
          brand: 'brand_1',
          externalId: 'tweet_222',
          organization: 'org_1',
        },
      ];

      const credential = { accessToken: 'at', accessTokenSecret: 'ats' };
      credentialsService.findOne.mockResolvedValue(credential as never);

      const analyticsMap = new Map([
        ['tweet_111', { likes: 10, views: 100 }],
        ['tweet_222', { likes: 5, views: 50 }],
      ]);
      twitterService.getMediaAnalyticsBatch.mockResolvedValue(
        analyticsMap as never,
      );
      postAnalyticsService.processTwitterAnalytics.mockResolvedValue(
        undefined as never,
      );

      const job = makeJob({ credentialId: 'cred_123', posts });

      await expect(processor.process(job)).resolves.toBeUndefined();

      expect(credentialsService.findOne).toHaveBeenCalledWith({
        _id: 'cred_123',
      });
      expect(twitterService.getMediaAnalyticsBatch).toHaveBeenCalledWith(
        ['tweet_111', 'tweet_222'],
        'at',
        'ats',
      );
      expect(
        postAnalyticsService.processTwitterAnalytics,
      ).toHaveBeenCalledTimes(2);
    });

    it('updates progress at 10%, 50%, 100%', async () => {
      const posts = [
        { _id: 'p1', brand: 'b1', externalId: 'tw_1', organization: 'o1' },
      ];
      credentialsService.findOne.mockResolvedValue({
        accessToken: 'at',
        accessTokenSecret: 'ats',
      } as never);
      twitterService.getMediaAnalyticsBatch.mockResolvedValue(
        new Map([['tw_1', { likes: 1 }]]) as never,
      );
      postAnalyticsService.processTwitterAnalytics.mockResolvedValue(
        undefined as never,
      );

      const job = makeJob({ credentialId: 'cred_123', posts });
      await processor.process(job);

      expect(job.updateProgress).toHaveBeenCalledWith(10);
      expect(job.updateProgress).toHaveBeenCalledWith(50);
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });
  });

  // ── process: empty posts ──────────────────────────────────────────────────
  describe('process (empty posts)', () => {
    it('returns early and warns when posts array is empty', async () => {
      const job = makeJob({ credentialId: 'cred_123', posts: [] });

      await expect(processor.process(job)).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalled();
      expect(twitterService.getMediaAnalyticsBatch).not.toHaveBeenCalled();
    });
  });

  // ── process: credential not found ────────────────────────────────────────
  describe('process (credential not found)', () => {
    it('throws when credential is not found', async () => {
      credentialsService.findOne.mockResolvedValue(null as never);

      const job = makeJob({
        credentialId: 'cred_missing',
        posts: [
          { _id: 'p1', brand: 'b1', externalId: 'tw_1', organization: 'o1' },
        ],
      });

      await expect(processor.process(job)).rejects.toThrow(
        'Credential cred_missing not found',
      );
    });
  });

  // ── process: missing analytics for some tweets ───────────────────────────
  describe('process (partial analytics)', () => {
    it('logs warn for tweets missing analytics and continues', async () => {
      const posts = [
        {
          _id: 'post_1',
          brand: 'b1',
          externalId: 'tweet_111',
          organization: 'o1',
        },
        {
          _id: 'post_2',
          brand: 'b1',
          externalId: 'tweet_missing',
          organization: 'o1',
        },
      ];

      credentialsService.findOne.mockResolvedValue({
        accessToken: 'at',
        accessTokenSecret: 'ats',
      } as never);

      const analyticsMap = new Map([['tweet_111', { likes: 7 }]]);
      twitterService.getMediaAnalyticsBatch.mockResolvedValue(
        analyticsMap as never,
      );
      postAnalyticsService.processTwitterAnalytics.mockResolvedValue(
        undefined as never,
      );

      const job = makeJob({ credentialId: 'cred_123', posts });

      await processor.process(job);

      // Only 1 post processed (tweet_111); tweet_missing warns
      expect(
        postAnalyticsService.processTwitterAnalytics,
      ).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('tweet_missing'),
      );
    });
  });

  // ── process: twitter API failure ─────────────────────────────────────────
  describe('process (API failure)', () => {
    it('throws and logs error when twitter batch fetch fails', async () => {
      const posts = [
        { _id: 'p1', brand: 'b1', externalId: 'tw_1', organization: 'o1' },
      ];
      credentialsService.findOne.mockResolvedValue({
        accessToken: 'at',
        accessTokenSecret: 'ats',
      } as never);
      twitterService.getMediaAnalyticsBatch.mockRejectedValue(
        new Error('Rate limit'),
      );

      const job = makeJob({ credentialId: 'cred_123', posts });

      await expect(processor.process(job)).rejects.toThrow('Rate limit');
      expect(logger.error).toHaveBeenCalled();
    });

    it('does not log rate-limit errors separately when rateLimitReset is set', async () => {
      const posts = [
        { _id: 'p1', brand: 'b1', externalId: 'tw_1', organization: 'o1' },
      ];
      credentialsService.findOne.mockResolvedValue({
        accessToken: 'at',
        accessTokenSecret: 'ats',
      } as never);

      const rateLimitError = Object.assign(new Error('rate limit'), {
        rateLimitReset: Date.now() + 60000,
      });
      twitterService.getMediaAnalyticsBatch.mockRejectedValue(rateLimitError);

      const job = makeJob({ credentialId: 'cred_123', posts });

      await expect(processor.process(job)).rejects.toThrow('rate limit');
      // Should NOT log because rateLimitReset is truthy
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  // ── circuit breaker integration ───────────────────────────────────────────
  describe('circuit breaker', () => {
    it('has a circuit breaker that wraps processInternal', () => {
      // The circuit breaker is created in constructor; verify processor has it
      expect(
        (processor as unknown as { circuitBreaker: unknown }).circuitBreaker,
      ).toBeDefined();
    });
  });
});
