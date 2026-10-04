import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { MediumService } from '@api/services/integrations/medium/services/medium.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

describe('MediumService', () => {
  let service: MediumService;

  beforeEach(async () => {
    const credentialsMock = {
      findOne: vi.fn(),
      patch: vi.fn(),
      // Multi-account resolution routes through `resolveBrandAccount`; the double
      // answers with whatever `findOne` is primed to return so the existing
      // single-account cases keep describing one connected account.
      resolveBrandAccount: vi.fn((options: { credentialId?: string | null }) =>
        credentialsMock.findOne(options),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediumService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => `mock-${key}`),
          },
        },
        {
          provide: CredentialsService,
          useValue: credentialsMock,
        },
        {
          provide: ArticlesService,
          useValue: {
            findOne: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: HttpService,
          useValue: {
            delete: vi.fn(),
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
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

    service = module.get<MediumService>(MediumService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAuthUrl', () => {
    it('encodes every OAuth parameter', () => {
      const url = new URL(service.generateAuthUrl('state with spaces&symbols'));

      expect(url.origin + url.pathname).toBe(
        'https://medium.com/m/oauth/authorize',
      );
      expect(url.searchParams.get('client_id')).toBe('mock-MEDIUM_CLIENT_ID');
      expect(url.searchParams.get('redirect_uri')).toBe(
        'mock-MEDIUM_REDIRECT_URI',
      );
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('scope')).toBe('basicProfile,publishPost');
      expect(url.searchParams.get('state')).toBe('state with spaces&symbols');
    });

    it('rejects missing OAuth configuration', async () => {
      const module = await Test.createTestingModule({
        providers: [
          MediumService,
          { provide: ConfigService, useValue: { get: vi.fn() } },
          {
            provide: CredentialsService,
            useValue: { findOne: vi.fn(), patch: vi.fn() },
          },
          {
            provide: ArticlesService,
            useValue: { findOne: vi.fn(), patch: vi.fn() },
          },
          {
            provide: HttpService,
            useValue: { delete: vi.fn(), get: vi.fn(), post: vi.fn() },
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

      const unconfigured = module.get<MediumService>(MediumService);

      expect(() => unconfigured.generateAuthUrl('state')).toThrow(
        HttpException,
      );
    });
  });
  describe('publishArticle', () => {
    it('loads and updates the article scoped to the organization', async () => {
      const findOneArticle = vi.fn().mockResolvedValue({
        content: '<p>Hello</p>',
        id: 'article-1',
        label: 'Hello',
        posts: [],
        slug: 'hello',
      });
      const patchOneWhere = vi.fn().mockResolvedValue(null);
      const post = vi.fn().mockReturnValue(
        of({
          data: {
            data: {
              id: 'medium-1',
              publishedAt: 1_700_000_000_000,
              url: 'https://medium.com/p/medium-1',
            },
          },
        }),
      );
      const module = await Test.createTestingModule({
        providers: [
          MediumService,
          { provide: ConfigService, useValue: { get: vi.fn(() => 'cfg') } },
          {
            provide: CredentialsService,
            useValue: {
              resolveBrandAccount: vi.fn().mockResolvedValue({
                accessToken: 'plain-token',
                externalId: 'medium-user',
              }),
            },
          },
          {
            provide: ArticlesService,
            useValue: { findOne: findOneArticle, patchOneWhere },
          },
          { provide: HttpService, useValue: { post } },
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
      vi.spyOn(EncryptionUtil, 'decrypt').mockReturnValue('decrypted');

      await module
        .get<MediumService>(MediumService)
        .publishArticle('article-1', 'org-1', 'brand-1');

      expect(findOneArticle).toHaveBeenCalledWith({
        id: 'article-1',
        organizationId: 'org-1',
      });
      expect(patchOneWhere).toHaveBeenCalledWith(
        { id: 'article-1', isDeleted: false, organizationId: 'org-1' },
        {
          posts: [
            expect.objectContaining({
              externalId: 'medium-1',
              platform: 'medium',
            }),
          ],
        },
      );
    });
  });
});
