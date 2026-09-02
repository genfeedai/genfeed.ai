import { SERVER_TOKENS } from '@api/index';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronCredentialsService } from '@workers/crons/credentials/cron.credentials.service';

describe('CronCredentialsService', () => {
  let service: CronCredentialsService;
  let credentialsService: { findAll: ReturnType<typeof vi.fn> };
  let twitterService: { refreshToken: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    credentialsService = {
      findAll: vi.fn().mockResolvedValue({ docs: [] }),
    };
    twitterService = {
      refreshToken: vi.fn().mockResolvedValue({}),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronCredentialsService,
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: SERVER_TOKENS.credentials,
          useValue: credentialsService,
        },
        {
          provide: FacebookService,
          useValue: {
            refreshToken: vi.fn(),
          },
        },
        {
          provide: GoogleAdsService,
          useValue: {
            refreshToken: vi.fn(),
          },
        },
        {
          provide: InstagramService,
          useValue: {
            refreshToken: vi.fn(),
          },
        },
        {
          provide: LinkedInService,
          useValue: {
            refreshToken: vi.fn(),
          },
        },
        {
          provide: PinterestService,
          useValue: {
            refreshToken: vi.fn(),
          },
        },
        {
          provide: RedditService,
          useValue: {
            refreshToken: vi.fn(),
          },
        },
        {
          provide: TiktokService,
          useValue: {
            refreshToken: vi.fn(),
          },
        },
        {
          provide: TwitterService,
          useValue: twitterService,
        },
        {
          provide: YoutubeService,
          useValue: {
            refreshToken: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CronCredentialsService>(CronCredentialsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('refreshes tokens for a Prisma SCREAMING twitter credential', async () => {
    credentialsService.findAll.mockResolvedValue({
      docs: [
        {
          brandId: 'brand-1',
          id: 'cred-1',
          organizationId: 'org-1',
          platform: 'TWITTER',
        },
      ],
    });

    await service.refreshExpiringTokens();

    expect(twitterService.refreshToken).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
    );
  });

  it('does not apply OAuth 2.0 refresh semantics to X Ads credentials', async () => {
    credentialsService.findAll.mockResolvedValue({
      docs: [
        {
          brandId: 'brand-1',
          id: 'cred-x-ads',
          organizationId: 'org-1',
          platform: 'X_ADS',
        },
      ],
    });

    await expect(service.refreshExpiringTokens()).resolves.toBeUndefined();
    expect(twitterService.refreshToken).not.toHaveBeenCalled();
  });
});
