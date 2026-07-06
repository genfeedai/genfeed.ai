vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((val: string) => `decrypted:${val}`),
    encrypt: vi.fn((val: string) => `encrypted:${val}`),
  },
}));

import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { DevtoService } from '@api/services/integrations/devto/services/devto.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

describe('DevtoService', () => {
  let service: DevtoService;
  let httpGetMock: ReturnType<typeof vi.fn>;
  let httpPostMock: ReturnType<typeof vi.fn>;
  let credentialsFindOneMock: ReturnType<typeof vi.fn>;
  let articlesFindOneMock: ReturnType<typeof vi.fn>;

  const loggerMock = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  const mockUser = {
    id: 12_345,
    name: 'Dev Founder',
    profile_image: 'https://dev.to/avatar.png',
    username: 'devfounder',
  };

  const mockArticle = {
    _id: 'article-1',
    content: '# Hello dev.to\n\nBody in markdown.',
    coverImageUrl: 'https://cdn.example.com/cover.png',
    excerpt: 'A short summary',
    slug: 'hello-devto',
    title: 'Hello dev.to',
  };

  const mockDevtoArticle = {
    canonical_url: null,
    description: 'A short summary',
    id: 999,
    published: true,
    published_at: '2026-07-05T00:00:00Z',
    slug: 'hello-devto-abc',
    tag_list: ['typescript'],
    title: 'Hello dev.to',
    url: 'https://dev.to/devfounder/hello-devto-abc',
  };

  beforeEach(async () => {
    httpGetMock = vi.fn();
    httpPostMock = vi.fn();
    credentialsFindOneMock = vi.fn();
    articlesFindOneMock = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevtoService,
        { provide: LoggerService, useValue: loggerMock },
        {
          provide: ConfigService,
          useValue: { get: vi.fn(() => undefined) },
        },
        {
          provide: HttpService,
          useValue: { get: httpGetMock, post: httpPostMock },
        },
        {
          provide: CredentialsService,
          useValue: { findOne: credentialsFindOneMock },
        },
        {
          provide: ArticlesService,
          useValue: { findOne: articlesFindOneMock },
        },
      ],
    }).compile();

    service = module.get<DevtoService>(DevtoService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCurrentUser', () => {
    it('should return the authenticated user with the api-key header', async () => {
      httpGetMock.mockReturnValue(of({ data: mockUser }));

      const result = await service.getCurrentUser('test-api-key');

      expect(result).toEqual(mockUser);
      expect(httpGetMock).toHaveBeenCalledWith(
        'https://dev.to/api/users/me',
        expect.objectContaining({
          headers: { 'api-key': 'test-api-key' },
        }),
      );
    });

    it('should throw when the request fails', async () => {
      httpGetMock.mockReturnValue(throwError(() => new Error('Unauthorized')));

      await expect(service.getCurrentUser('bad-key')).rejects.toThrow(
        'Unauthorized',
      );
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('publishArticle', () => {
    beforeEach(() => {
      credentialsFindOneMock.mockResolvedValue({
        accessToken: 'encrypted-token',
        platform: CredentialPlatform.DEV_TO,
      });
      articlesFindOneMock.mockResolvedValue(mockArticle);
      httpPostMock.mockReturnValue(of({ data: mockDevtoArticle }));
    });

    it('should publish an article with mapped fields and decrypted key', async () => {
      const result = await service.publishArticle(
        'article-1',
        'org-1',
        'brand-1',
        {
          published: true,
          tags: ['typescript', 'webdev'],
        },
      );

      expect(result).toEqual(mockDevtoArticle);
      expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('encrypted-token');
      expect(httpPostMock).toHaveBeenCalledWith(
        'https://dev.to/api/articles',
        {
          article: {
            body_markdown: mockArticle.content,
            description: mockArticle.excerpt,
            main_image: mockArticle.coverImageUrl,
            published: true,
            tags: ['typescript', 'webdev'],
            title: mockArticle.title,
          },
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            'api-key': 'decrypted:encrypted-token',
          }),
        }),
      );
    });

    it('should create a draft when published is false', async () => {
      await service.publishArticle('article-1', 'org-1', 'brand-1', {
        published: false,
      });

      const [, payload] = httpPostMock.mock.calls[0];
      expect(payload.article.published).toBe(false);
    });

    it('should only include canonical_url when explicitly provided', async () => {
      await service.publishArticle('article-1', 'org-1', 'brand-1', {});
      let [, payload] = httpPostMock.mock.calls[0];
      expect(payload.article).not.toHaveProperty('canonical_url');

      httpPostMock.mockClear();
      await service.publishArticle('article-1', 'org-1', 'brand-1', {
        canonicalUrl: 'https://mysite.dev/hello',
      });
      [, payload] = httpPostMock.mock.calls[0];
      expect(payload.article.canonical_url).toBe('https://mysite.dev/hello');
    });

    it('should throw when the credential is missing', async () => {
      credentialsFindOneMock.mockResolvedValue(null);

      await expect(
        service.publishArticle('article-1', 'org-1', 'brand-1'),
      ).rejects.toThrow('dev.to credential not found');
    });

    it('should throw when the article is not found', async () => {
      articlesFindOneMock.mockResolvedValue(null);

      await expect(
        service.publishArticle('article-1', 'org-1', 'brand-1'),
      ).rejects.toThrow('Article not found');
    });
  });

  describe('getDecryptedApiKey', () => {
    it('should return the decrypted api key', async () => {
      credentialsFindOneMock.mockResolvedValue({
        accessToken: 'encrypted-token',
        platform: CredentialPlatform.DEV_TO,
      });

      const result = await service.getDecryptedApiKey('org-1', 'brand-1');

      expect(result).toBe('decrypted:encrypted-token');
      expect(credentialsFindOneMock).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: 'brand-1',
          isDeleted: false,
          organization: 'org-1',
          platform: CredentialPlatform.DEV_TO,
        }),
      );
    });

    it('should throw when credential has no access token', async () => {
      credentialsFindOneMock.mockResolvedValue({ accessToken: null });

      await expect(
        service.getDecryptedApiKey('org-1', 'brand-1'),
      ).rejects.toThrow('dev.to credential not found');
    });
  });
});
