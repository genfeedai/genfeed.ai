import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { SettingsService } from '@api/collections/settings/services/settings.service';
import type { TrendsService } from '@api/collections/trends/services/trends.service';
import type { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import type { NotificationsService } from '@api/services/notifications/notifications.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type {
  TrendHashtagInspirationInput,
  TrendSoundInspirationInput,
  TrendVideoInspirationInput,
} from './trend-inspiration.processor';
import { TrendInspirationProcessor } from './trend-inspiration.processor';

function createMockLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function createMockTrendsService(
  overrides: Partial<TrendsService> = {},
): TrendsService {
  return {
    getTrendingHashtags: vi.fn().mockResolvedValue([
      {
        hashtag: 'viral',
        postCount: 100000,
        relatedHashtags: ['trending', 'fyp', 'foryou', 'explore', 'content'],
      },
      {
        hashtag: 'dance',
        postCount: 50000,
        relatedHashtags: ['moves'],
      },
    ]),
    getTrendingSounds: vi.fn().mockResolvedValue([
      {
        authorName: 'DJ Test',
        coverUrl: 'https://example.com/cover.jpg',
        duration: 15,
        growthRate: 1.5,
        playUrl: 'https://example.com/sound1.mp3',
        soundId: 'sound-1',
        soundName: 'Trendy Beat',
        usageCount: 50000,
      },
      {
        authorName: null,
        coverUrl: null,
        duration: 45,
        growthRate: 0.3,
        playUrl: 'https://example.com/sound2.mp3',
        soundId: 'sound-2',
        soundName: 'Chill Vibes',
        usageCount: 1000,
      },
    ]),
    getViralVideos: vi.fn().mockResolvedValue([
      {
        _id: { toString: () => 'video-1' },
        description: 'A comedy video',
        duration: 30,
        engagementRate: 5.2,
        hashtags: ['#funny', '#viral'],
        hook: 'Wait for it...',
        soundId: 'sound-1',
        title: 'Trending Video 1',
        videoUrl: 'https://example.com/video1',
        viralScore: 90,
      },
      {
        _id: { toString: () => 'video-2' },
        description: 'tutorial video',
        duration: 60,
        hashtags: ['#coding'],
        title: 'Tutorial: How to code',
        videoUrl: 'https://example.com/video2',
        viralScore: 60,
      },
    ]),
    ...overrides,
  } as unknown as TrendsService;
}

function createMockSettingsService(
  overrides: Partial<SettingsService> = {},
): SettingsService {
  return {
    findOne: vi.fn().mockResolvedValue({
      isTrendNotificationsEmail: true,
      isTrendNotificationsInApp: true,
      isTrendNotificationsTelegram: true,
      trendNotificationsEmailAddress: 'test@example.com',
      trendNotificationsMinViralScore: 70,
      trendNotificationsTelegramChatId: 'chat-123',
    }),
    ...overrides,
  } as unknown as SettingsService;
}

function createMockNotificationsService(
  overrides: Partial<NotificationsService> = {},
): NotificationsService {
  return {
    sendEmail: vi.fn().mockResolvedValue(undefined),
    sendTelegramMessage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as NotificationsService;
}

function createMockCreditsUtilsService(
  overrides: Partial<CreditsUtilsService> = {},
): CreditsUtilsService {
  return {
    checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
    deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as CreditsUtilsService;
}

function createMockModelsService(
  overrides: Partial<ModelsService> = {},
): ModelsService {
  return {
    findOne: vi.fn().mockResolvedValue({
      inputTokenPricePerMillion: 1,
      key: 'openai/gpt-5',
      minCost: 1,
      outputTokenPricePerMillion: 1,
      pricingType: 'per-token',
    }),
    ...overrides,
  } as unknown as ModelsService;
}

function createMockOrganizationsService(
  overrides: Partial<OrganizationsService> = {},
): OrganizationsService {
  return {
    findOne: vi.fn().mockResolvedValue({
      user: { toString: () => 'user-123' },
    }),
    ...overrides,
  } as unknown as OrganizationsService;
}

function createMockReplicateService(
  overrides: Partial<ReplicateService> = {},
): ReplicateService {
  return {
    generateTextCompletionSync: vi
      .fn()
      .mockResolvedValue('Generated AI prompt for content creation'),
    ...overrides,
  } as unknown as ReplicateService;
}

describe('TrendInspirationProcessor', () => {
  const mockOrganizationId = '507f1f77bcf86cd799439011';
  let processor: TrendInspirationProcessor;
  let trendsService: TrendsService;
  let settingsService: SettingsService;
  let notificationsService: NotificationsService;
  let creditsUtilsService: CreditsUtilsService;
  let modelsService: ModelsService;
  let organizationsService: OrganizationsService;
  let replicateService: ReplicateService;
  let logger: LoggerService;

  beforeEach(() => {
    logger = createMockLogger();
    trendsService = createMockTrendsService();
    settingsService = createMockSettingsService();
    notificationsService = createMockNotificationsService();
    creditsUtilsService = createMockCreditsUtilsService();
    modelsService = createMockModelsService();
    organizationsService = createMockOrganizationsService();
    replicateService = createMockReplicateService();
    processor = new TrendInspirationProcessor(
      trendsService,
      settingsService,
      notificationsService,
      creditsUtilsService,
      modelsService,
      organizationsService,
      replicateService,
      logger,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('processVideoInspiration', () => {
    const videoInput: TrendVideoInspirationInput = {
      includeOriginalHook: true,
      inspirationStyle: 'match_closely',
      minViralScore: 80,
      platform: 'tiktok',
    };

    it('should return video inspiration output', async () => {
      const result = await processor.processVideoInspiration(
        videoInput,
        mockOrganizationId,
      );

      expect(result.prompt).toBeDefined();
      expect(result.aspectRatio).toBe('9:16'); // tiktok
      expect(result.hashtags).toEqual(['#funny', '#viral']);
      expect(result.sourceTrendTitle).toBe('Trending Video 1');
    });

    it('should use correct aspect ratio per platform', async () => {
      const platforms: Record<string, '16:9' | '9:16' | '1:1'> = {
        instagram: '1:1',
        tiktok: '9:16',
        twitter: '16:9',
        youtube: '16:9',
      };

      for (const [platform, expectedRatio] of Object.entries(platforms)) {
        const input = { ...videoInput, platform };
        const result = await processor.processVideoInspiration(
          input,
          mockOrganizationId,
        );
        expect(result.aspectRatio).toBe(expectedRatio);
      }
    });

    it('should default to 16:9 for unknown platforms', async () => {
      const input = { ...videoInput, platform: 'mastodon' };
      const result = await processor.processVideoInspiration(
        input,
        mockOrganizationId,
      );
      expect(result.aspectRatio).toBe('16:9');
    });

    it('should throw when no videos found for platform', async () => {
      trendsService.getViralVideos = vi.fn().mockResolvedValue([]);

      await expect(
        processor.processVideoInspiration(videoInput, mockOrganizationId),
      ).rejects.toThrow('No trending videos found for platform: tiktok');
    });

    it('should throw when no videos match minViralScore', async () => {
      const input = { ...videoInput, minViralScore: 999 };

      await expect(
        processor.processVideoInspiration(input, mockOrganizationId),
      ).rejects.toThrow('No videos found with viral score >= 999');
    });

    it('should select specific video by trendId when not auto', async () => {
      const input: TrendVideoInspirationInput = {
        ...videoInput,
        auto: false,
        minViralScore: 50,
        trendId: 'video-1',
      };

      const result = await processor.processVideoInspiration(
        input,
        mockOrganizationId,
      );
      expect(result.sourceTrendTitle).toBe('Trending Video 1');
    });

    it('should detect video style from metadata', async () => {
      // The first video has "comedy" in description
      const result = await processor.processVideoInspiration(
        videoInput,
        mockOrganizationId,
      );
      expect(result.style).toBe('comedy');
    });

    it('should use fallback prompt when AI returns empty', async () => {
      replicateService.generateTextCompletionSync = vi
        .fn()
        .mockResolvedValue('');

      const result = await processor.processVideoInspiration(
        videoInput,
        mockOrganizationId,
      );
      expect(result.prompt).toContain('tiktok');
    });
  });

  describe('processHashtagInspiration', () => {
    const hashtagInput: TrendHashtagInspirationInput = {
      contentPreference: 'video',
      platform: 'instagram',
    };

    it('should return hashtag inspiration output', async () => {
      const result = await processor.processHashtagInspiration(
        hashtagInput,
        mockOrganizationId,
      );

      expect(result.prompt).toBeDefined();
      expect(result.sourceHashtag).toBe('viral');
      expect(result.hashtags.length).toBeGreaterThanOrEqual(1);
      expect(result.hashtagPostCount).toBe(100000);
    });

    it('should include related hashtags', async () => {
      const result = await processor.processHashtagInspiration(
        hashtagInput,
        mockOrganizationId,
      );
      // Should include source + up to 4 related
      expect(result.hashtags).toContain('viral');
    });

    it('should throw when no hashtags found', async () => {
      trendsService.getTrendingHashtags = vi.fn().mockResolvedValue([]);

      await expect(
        processor.processHashtagInspiration(hashtagInput, mockOrganizationId),
      ).rejects.toThrow('No trending hashtags found for platform: instagram');
    });

    it('should select specific hashtag by name', async () => {
      const input: TrendHashtagInspirationInput = {
        ...hashtagInput,
        auto: false,
        hashtag: 'dance',
      };

      const result = await processor.processHashtagInspiration(
        input,
        mockOrganizationId,
      );
      expect(result.sourceHashtag).toBe('dance');
    });

    it('should return correct content type for video preference', async () => {
      const result = await processor.processHashtagInspiration(
        hashtagInput,
        mockOrganizationId,
      );
      expect(result.contentType).toBe('video');
    });

    it('should return platform default for any preference', async () => {
      const input = { ...hashtagInput, contentPreference: 'any' as const };
      const result = await processor.processHashtagInspiration(
        input,
        mockOrganizationId,
      );
      expect(result.contentType).toBe('carousel'); // instagram default
    });

    it('should return thread for twitter with any preference', async () => {
      const input: TrendHashtagInspirationInput = {
        ...hashtagInput,
        contentPreference: 'any',
        platform: 'twitter',
      };
      const result = await processor.processHashtagInspiration(
        input,
        mockOrganizationId,
      );
      expect(result.contentType).toBe('thread');
    });
  });

  describe('processSoundInspiration', () => {
    const soundInput: TrendSoundInspirationInput = {
      minUsageCount: 5000,
    };

    it('should return sound inspiration output', async () => {
      const result = await processor.processSoundInspiration(soundInput);

      expect(result.soundId).toBe('sound-1');
      expect(result.soundName).toBe('Trendy Beat');
      expect(result.usageCount).toBe(50000);
      expect(result.authorName).toBe('DJ Test');
    });

    it('should throw when no sounds found', async () => {
      trendsService.getTrendingSounds = vi.fn().mockResolvedValue([]);

      await expect(
        processor.processSoundInspiration(soundInput),
      ).rejects.toThrow('No trending sounds found');
    });

    it('should filter by minUsageCount', async () => {
      const input: TrendSoundInspirationInput = { minUsageCount: 100000 };

      await expect(processor.processSoundInspiration(input)).rejects.toThrow(
        'No sounds found with usage count >= 100000',
      );
    });

    it('should filter by maxDuration', async () => {
      const input: TrendSoundInspirationInput = {
        maxDuration: 10, // Both sounds are > 10s
        minUsageCount: 100,
      };

      await expect(processor.processSoundInspiration(input)).rejects.toThrow(
        'No sounds found with usage count >= 100',
      );
    });

    it('should return null fields when sound metadata is missing', async () => {
      trendsService.getTrendingSounds = vi.fn().mockResolvedValue([
        {
          soundId: 's-1',
          soundName: 'No Metadata',
          usageCount: 10000,
        },
      ]);

      const result = await processor.processSoundInspiration(soundInput);
      expect(result.authorName).toBeNull();
      expect(result.coverUrl).toBeNull();
      expect(result.duration).toBe(0);
      expect(result.growthRate).toBe(0);
    });
  });

  describe('sendTrendSummaryNotifications', () => {
    it('should send both telegram and email notifications', async () => {
      await processor.sendTrendSummaryNotifications('org-1', 'user-1');

      expect(notificationsService.sendTelegramMessage).toHaveBeenCalledWith(
        'chat-123',
        expect.stringContaining('Trend Summary'),
      );
      expect(notificationsService.sendEmail).toHaveBeenCalledWith(
        'test@example.com',
        'Your Daily Trend Summary - Genfeed',
        expect.stringContaining('Your Trend Summary'),
      );
    });

    it('should skip notifications when no settings found', async () => {
      settingsService.findOne = vi.fn().mockResolvedValue(null);

      await processor.sendTrendSummaryNotifications('org-1', 'user-1');

      expect(notificationsService.sendTelegramMessage).not.toHaveBeenCalled();
      expect(notificationsService.sendEmail).not.toHaveBeenCalled();
    });

    it('should skip when all notifications are disabled', async () => {
      settingsService.findOne = vi.fn().mockResolvedValue({
        isTrendNotificationsEmail: false,
        isTrendNotificationsInApp: false,
        isTrendNotificationsTelegram: false,
      });

      await processor.sendTrendSummaryNotifications('org-1', 'user-1');

      expect(notificationsService.sendTelegramMessage).not.toHaveBeenCalled();
      expect(notificationsService.sendEmail).not.toHaveBeenCalled();
    });
  });
});
