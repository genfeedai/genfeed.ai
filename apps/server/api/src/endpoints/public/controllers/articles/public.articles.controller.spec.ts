import { ArticlesQueryDto } from '@api/collections/articles/dto/articles-query.dto';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { PublicArticlesController } from '@api/endpoints/public/controllers/articles/public.articles.controller';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ArticleCategory, ArticleStatus, AssetScope } from '@genfeedai/enums';
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

vi.mock('@genfeedai/serializers', () => ({
  ArticleSerializer: { opts: {}, serialize: vi.fn((data) => data) },
}));

describe('PublicArticlesController', () => {
  let controller: PublicArticlesController;
  let articlesService: ArticlesService;

  const mockArticle = {
    _id: '507f1f77bcf86cd799439014',
    category: 'Technology',
    content: 'This is a public article',
    createdAt: new Date(),
    isDeleted: false,
    label: 'Public Article',
    organization: {
      _id: '507f191e810c19729de860ee',
      name: 'Test Org',
    },
    publishedAt: new Date(),
    scope: AssetScope.PUBLIC,
    slug: 'public-article',
    status: ArticleStatus.PUBLIC,
    summary: 'A public article summary',
    tags: [],
    updatedAt: new Date(),
    user: {
      _id: '507f191e810c19729de860ee',
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicArticlesController],
      providers: [
        {
          provide: ArticlesService,
          useValue: mockArticlesService,
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
      const query: ArticlesQueryDto = {
        limit: 10,
        page: 1,
      };

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
      expect(result.data).toEqual(articles);
    });

    it('should filter by search term', async () => {
      const request = {} as Request;
      const query: ArticlesQueryDto = {
        limit: 10,
        page: 1,
        search: 'technology',
      };

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
      const pipeline = call[0];
      expect(pipeline[0].$match.$or).toBeDefined();
    });

    it('should filter by category', async () => {
      const request = {} as Request;
      const query: ArticlesQueryDto = {
        category: ArticleCategory.POST,
        limit: 10,
        page: 1,
      };

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
      const pipeline = call[0];
      expect(pipeline[0].$match.category).toBe(ArticleCategory.POST);
    });

    it('should filter by tag', async () => {
      const request = {} as Request;
      const query: ArticlesQueryDto = {
        limit: 10,
        page: 1,
        tag: '507f1f77bcf86cd799439999',
      };

      mockArticlesService.findAll.mockResolvedValue({
        docs: [],
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 0,
      });

      await controller.findPublicArticles(request, query);

      expect(articlesService.findAll).toHaveBeenCalled();
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
  });

  describe('findPublicArticleById', () => {
    it('should return article by id', async () => {
      const request = {} as Request;
      const id = '507f1f77bcf86cd799439014';
      mockArticlesService.findOne.mockResolvedValue(mockArticle);

      const result = await controller.findPublicArticleById(request, id);

      expect(articlesService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: id,
          isDeleted: false,
          status: ArticleStatus.PUBLIC,
        }),
      );
      expect(result).toEqual(mockArticle);
    });

    it('should return not found when article does not exist', async () => {
      const request = {} as Request;
      const id = '507f1f77bcf86cd799439014';
      mockArticlesService.findOne.mockResolvedValue(null);

      const result = await controller.findPublicArticleById(request, id);

      expect(result).toBeDefined();
      expect(result.errors).toBeDefined();
    });
  });
});
