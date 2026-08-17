import { ArticlesQueryDto } from '@api/collections/articles/dto/articles-query.dto';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { PublicArticlesController } from '@api/endpoints/public/controllers/articles/public.articles.controller';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ArticleCategory, ArticleStatus, AssetScope } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
    status: 404,
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

vi.mock('@genfeedai/serializers', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/serializers')>();
  return {
    ...actual,
    ArticleSerializer: { opts: {}, serialize: vi.fn((data) => data) },
  };
});

/**
 * `page`/`limit`/`pagination`/`isDeleted`/`sort` are non-optional on
 * `BaseQueryDto` — they carry initializers, not `?`. A partial object literal
 * annotated `ArticlesQueryDto` is therefore a TS2739, which is why this file
 * held four baselined spec-typecheck errors. Building the query through a
 * factory supplies the framework defaults once and keeps each test's literal
 * down to the field under test.
 */
function buildArticlesQuery(
  overrides: Partial<ArticlesQueryDto> = {},
): ArticlesQueryDto {
  return {
    isDeleted: false,
    limit: 10,
    page: 1,
    sort: 'createdAt: -1',
    ...overrides,
  };
}

describe('PublicArticlesController', () => {
  let controller: PublicArticlesController;
  let articlesService: ArticlesService;

  const mockArticle = {
    id: testId('article'),
    category: 'Technology',
    content: 'This is a public article',
    createdAt: new Date(),
    isDeleted: false,
    label: 'Public Article',
    organization: {
      id: testId('org'),
      name: 'Test Org',
    },
    publishedAt: new Date(),
    scope: AssetScope.PUBLIC,
    slug: 'public-article',
    status: ArticleStatus.PUBLISHED,
    summary: 'A public article summary',
    tags: [],
    updatedAt: new Date(),
    user: {
      id: testId('user'),
      email: 'john@example.com',
      name: 'John Doe',
    },
  };

  const mockArticlesService = {
    findAll: vi.fn(),
    findOne: vi.fn(),
    findPublicArticleBySlug: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  // No signing key configured: preview tokens always fail closed, so every
  // request in this suite resolves to published-only reads.
  const mockConfigService = {
    get: vi.fn().mockReturnValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicArticlesController],
      providers: [
        {
          provide: ArticlesService,
          useValue: mockArticlesService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PublicArticlesController>(PublicArticlesController);
    articlesService = module.get<ArticlesService>(ArticlesService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findPublicArticles', () => {
    it('should return public articles', async () => {
      const request = {} as Request;
      const query = buildArticlesQuery();

      const articles = [mockArticle];
      mockArticlesService.findAll.mockResolvedValue({
        docs: articles,
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });

      const result = await controller.findPublicArticles(request, query);

      expect(articlesService.findAll).toHaveBeenCalled();
      expect(articlesService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            publishedAt: { lte: expect.any(Date) },
            status: 'PUBLISHED',
          }),
        }),
        expect.any(Object),
      );
      expect(result.data).toEqual(articles);
    });

    it('should filter by search term', async () => {
      const request = {} as Request;
      const query = buildArticlesQuery({ search: 'technology' });

      mockArticlesService.findAll.mockResolvedValue({
        docs: [mockArticle],
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });

      await controller.findPublicArticles(request, query);

      expect(articlesService.findAll).toHaveBeenCalled();
      const call = mockArticlesService.findAll.mock.calls[0];
      const queryArg = call[0] as { where: Record<string, unknown> };
      // The searchable columns are `label`/`summary` since #2767 — the old
      // `title`/`excerpt` spellings are unknown arguments to Prisma and made
      // every `?search=` request 500.
      expect(queryArg.where.OR).toEqual([
        { label: { mode: 'insensitive', contains: 'technology' } },
        { summary: { mode: 'insensitive', contains: 'technology' } },
        { content: { mode: 'insensitive', contains: 'technology' } },
      ]);
    });

    it('should filter by category', async () => {
      const request = {} as Request;
      const query = buildArticlesQuery({ category: ArticleCategory.POST });

      mockArticlesService.findAll.mockResolvedValue({
        docs: [mockArticle],
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });

      await controller.findPublicArticles(request, query);

      expect(articlesService.findAll).toHaveBeenCalled();
      const call = mockArticlesService.findAll.mock.calls[0];
      const queryArg = call[0] as { where: Record<string, unknown> };
      expect(queryArg.where.category).toBe(ArticleCategory.POST);
    });

    it('should filter by tag through the Tag[] relation', async () => {
      const request = {} as Request;
      const tag = testId('tag');
      const query = buildArticlesQuery({ tag });

      mockArticlesService.findAll.mockResolvedValue({
        docs: [],
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 0,
      });

      await controller.findPublicArticles(request, query);

      const call = mockArticlesService.findAll.mock.calls[0];
      const queryArg = call[0] as { where: Record<string, unknown> };
      // `tags` is a Tag[] relation, so it takes `{ some: { id } }`. Assigning
      // the bare tag id was an unknown-argument error on every `?tag=` request.
      expect(queryArg.where.tags).toEqual({ some: { id: tag } });
    });

    it('should ignore a tag that is not a valid entity id', async () => {
      const request = {} as Request;
      const query = buildArticlesQuery({ tag: 'not-an-id' });

      mockArticlesService.findAll.mockResolvedValue({
        docs: [],
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 0,
      });

      await controller.findPublicArticles(request, query);

      const call = mockArticlesService.findAll.mock.calls[0];
      const queryArg = call[0] as { where: Record<string, unknown> };
      expect(queryArg.where).not.toHaveProperty('tags');
    });
  });

  describe('findPublicArticleBySlug', () => {
    it('should return article by slug', async () => {
      const request = {} as Request;
      const slug = 'public-article';
      mockArticlesService.findPublicArticleBySlug.mockResolvedValue(
        mockArticle,
      );

      const result = await controller.findPublicArticleBySlug(request, slug);

      expect(articlesService.findPublicArticleBySlug).toHaveBeenCalledWith(
        slug,
        false,
      );
      expect(result).toEqual(mockArticle);
    });

    it('should return not found when article does not exist', async () => {
      const request = {} as Request;
      const slug = 'non-existent';
      mockArticlesService.findPublicArticleBySlug.mockResolvedValue(null);

      const result = await controller.findPublicArticleBySlug(request, slug);

      expect(result).toBeDefined();
    });

    it('should not grant preview access for an unsigned token', async () => {
      const request = {} as Request;
      const slug = 'public-article';
      mockArticlesService.findPublicArticleBySlug.mockResolvedValue(
        mockArticle,
      );

      await controller.findPublicArticleBySlug(request, slug, 'not-a-token');

      expect(articlesService.findPublicArticleBySlug).toHaveBeenCalledWith(
        slug,
        false,
      );
    });
  });

  describe('findPublicArticleById', () => {
    it('should return article by id', async () => {
      const request = {} as Request;
      const id = testId('article', 2);
      mockArticlesService.findOne.mockResolvedValue(mockArticle);

      const result = await controller.findPublicArticleById(request, id);

      expect(articlesService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          id,
          publishedAt: { lte: expect.any(Date) },
          status: 'PUBLISHED',
        }),
      );
      expect(result).toEqual(mockArticle);
    });

    it('should return not found when article does not exist', async () => {
      const request = {} as Request;
      const id = testId('article', 2);
      mockArticlesService.findOne.mockResolvedValue(null);

      const result = await controller.findPublicArticleById(request, id);

      expect(result).toBeDefined();
      expect(result.errors).toBeDefined();
    });
  });
});
