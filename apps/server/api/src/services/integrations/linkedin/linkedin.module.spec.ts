import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { LinkedInController } from '@api/services/integrations/linkedin/controllers/linkedin.controller';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';

describe('LinkedInModule', () => {
  let _module: TestingModule;

  beforeEach(async () => {
    _module = await Test.createTestingModule({
      controllers: [LinkedInController],
      providers: [
        LinkedInService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              const config: Record<string, string> = {
                LINKEDIN_CLIENT_ID: 'test-client-id',
                LINKEDIN_CLIENT_SECRET: 'test-client-secret',
                LINKEDIN_REDIRECT_URI: 'http://localhost:3000/oauth/linkedin',
              };
              return config[key] ?? null;
            }),
          },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn() },
        },
        {
          provide: HttpService,
          useValue: { get: vi.fn(), post: vi.fn() },
        },
        {
          provide: BrandScraperService,
          useValue: { scrapeLinkedIn: vi.fn() },
        },
        {
          provide: BrandsService,
          useValue: { findOne: vi.fn() },
        },
        {
          provide: CredentialsService,
          useValue: {
            findOne: vi.fn(),
            patch: vi.fn(),
            saveCredentials: vi.fn(),
          },
        },
      ],
    }).compile();
  });

  afterEach(async () => {
    if (_module) {
      await _module.close();
    }
  });

  it('should be defined', () => {
    expect(_module).toBeDefined();
  });
});
