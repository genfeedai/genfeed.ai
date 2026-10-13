import { DevtoService } from '@api/services/integrations/devto/services/devto.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

describe('DevtoService', () => {
  let service: DevtoService;
  let httpGetMock: ReturnType<typeof vi.fn>;
  let httpPostMock: ReturnType<typeof vi.fn>;

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

  describe('createArticle', () => {
    it('posts Markdown with the api key and omits empty tags', async () => {
      httpPostMock.mockReturnValue(of({ data: mockDevtoArticle }));

      const result = await service.createArticle('plain-api-key', {
        bodyMarkdown: '## Intro\n\nHello',
        published: true,
        tags: [],
        title: 'Hello dev.to',
      });

      expect(result).toEqual(mockDevtoArticle);
      expect(httpPostMock).toHaveBeenCalledWith(
        'https://dev.to/api/articles',
        {
          article: {
            body_markdown: '## Intro\n\nHello',
            published: true,
            title: 'Hello dev.to',
          },
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            'api-key': 'plain-api-key',
          }),
        }),
      );
    });

    it('creates a draft and forwards tags when the publisher supplies them', async () => {
      httpPostMock.mockReturnValue(
        of({ data: { ...mockDevtoArticle, published: false } }),
      );

      await service.createArticle('plain-api-key', {
        bodyMarkdown: 'Draft',
        published: false,
        tags: ['typescript'],
        title: 'Hello dev.to',
      });

      const [, payload] = httpPostMock.mock.calls[0];
      expect(payload.article.published).toBe(false);
      expect(payload.article.tags).toEqual(['typescript']);
      expect(payload.article).not.toHaveProperty('canonical_url');
    });

    it('should throw when the request fails', async () => {
      httpPostMock.mockReturnValue(throwError(() => new Error('dev.to down')));

      await expect(
        service.createArticle('plain-api-key', {
          bodyMarkdown: 'Hello',
          published: true,
          tags: [],
          title: 'Hello',
        }),
      ).rejects.toThrow('dev.to down');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });
});
