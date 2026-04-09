import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
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

  beforeEach(async () => {
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
          provide: CredentialsService,
          useValue: {
            findAll: vi.fn().mockResolvedValue({ docs: [] }),
          },
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
          useValue: {
            refreshToken: vi.fn(),
          },
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
});
