import { Readable, type Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { ImagesService } from '@api/collections/images/services/images.service';
import { PublicImagesController } from '@api/endpoints/public/controllers/images/public.images.controller';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { createRecordedResponse } from '@api/shared/testing/recorded-response.fixture';
import {
  createIngredientDocumentFixture,
  createPaginatedFixture,
} from '@api-test/fixtures/ingredient-document.fixture';
import { echoSerialize } from '@api-test/helpers/json-api-resource';
import { tenantReadQuery } from '@api-test/helpers/tenant-read.fixture';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import { IngredientSerializer } from '@genfeedai/serializers';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request as ExpressRequest } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
  setTopLinks: vi.fn((_req, opts) => opts),
}));

// Mock stream for S3 file downloads
describe('PublicImagesController', () => {
  let controller: PublicImagesController;
  let filesClientService: vi.Mocked<FilesClientService>;
  let imagesService: vi.Mocked<ImagesService>;
  let loggerService: vi.Mocked<LoggerService>;

  const brandId = testId('brand');
  const imageId = testId('image');

  const mockRequest = {
    originalUrl: '/api/public/images',
    query: {},
  } as unknown as ExpressRequest;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicImagesController],
      providers: [
        {
          provide: AuthorizedMediaUrlService,
          useValue: { projectPublicIngredients: vi.fn().mockResolvedValue([]) },
        },
        {
          provide: ConfigService,
          useValue: { isAuthorizedMediaDeliveryEnabled: false },
        },
        {
          provide: FilesClientService,
          useValue: {
            getFileFromS3: vi.fn(),
          },
        },
        {
          provide: ImagesService,
          useValue: {
            findAll: vi.fn(),
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

    controller = module.get<PublicImagesController>(PublicImagesController);
    filesClientService = module.get(FilesClientService);
    imagesService = module.get(ImagesService);
    loggerService = module.get(LoggerService);

    vi.spyOn(IngredientSerializer, 'serialize').mockImplementation(
      echoSerialize,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findPublicImages', () => {
    it('should return public images', async () => {
      const mockImages = createPaginatedFixture(
        [
          createIngredientDocumentFixture({
            id: 'image-1',
            category: IngredientCategory.IMAGE,
            scope: AssetScope.PUBLIC,
            status: IngredientStatus.GENERATED,
            url: 'https://example.com/image1.jpg',
          }),
          createIngredientDocumentFixture({
            id: 'image-2',
            category: IngredientCategory.IMAGE,
            scope: AssetScope.PUBLIC,
            status: IngredientStatus.GENERATED,
            url: 'https://example.com/image2.jpg',
          }),
        ],
        { limit: 10 },
      );

      imagesService.findAll.mockResolvedValue(mockImages);

      const query = tenantReadQuery(BaseQueryDto, {
        limit: 10,
        page: 1,
      });

      const result = await controller.findPublicImages(mockRequest, query);

      expect(imagesService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: 'IMAGE',
            isDeleted: false,
            scope: AssetScope.PUBLIC,
            status: {
              in: [IngredientStatus.GENERATED],
            },
          }),
        }),
        expect.objectContaining({
          limit: 10,
          page: 1,
        }),
      );
      expect(result).toBeDefined();
      expect(loggerService.log).toHaveBeenCalledWith(
        'PublicImagesController findPublicImages',
        { query },
      );
    });

    it('should filter by account when provided', async () => {
      const mockImages = createPaginatedFixture([]);

      imagesService.findAll.mockResolvedValue(mockImages);

      const query = tenantReadQuery(BaseQueryDto, {
        limit: 10,
        page: 1,
      });

      const result = await controller.findPublicImages(
        mockRequest,
        query,
        undefined,
        brandId,
      );

      expect(result).toEqual({ data: [] });
      expect(imagesService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            brandId,
          }),
        }),
        expect.any(Object),
      );
    });

    it.each([
      ['true', true],
      [undefined, undefined],
      ['false', undefined],
    ])(
      'filters featured images only when isHighlighted is %s',
      async (flag, expected) => {
        imagesService.findAll.mockResolvedValue(createPaginatedFixture([]));
        const query = tenantReadQuery(BaseQueryDto, { limit: 10, page: 1 });

        await controller.findPublicImages(
          mockRequest,
          query,
          undefined,
          undefined,
          undefined,
          flag,
        );

        const aggregateArg = imagesService.findAll.mock.calls[0][0] as {
          where?: { isHighlighted?: boolean };
        };
        expect(aggregateArg.where?.isHighlighted).toBe(expected);
      },
    );

    it('should filter by tag when provided', async () => {
      const tag = 'nature';
      const mockImages = createPaginatedFixture([]);

      imagesService.findAll.mockResolvedValue(mockImages);

      const query = tenantReadQuery(BaseQueryDto, {
        limit: 10,
        page: 1,
      });

      const result = await controller.findPublicImages(mockRequest, query, tag);

      expect(result).toEqual({ data: [] });
      expect(imagesService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tags: {
              some: { label: { contains: tag, mode: 'insensitive' } },
            },
          }),
        }),
        expect.any(Object),
      );
    });

    it('should handle empty results', async () => {
      const mockImages = createPaginatedFixture([]);

      imagesService.findAll.mockResolvedValue(mockImages);

      const query = tenantReadQuery(BaseQueryDto, {
        limit: 10,
        page: 1,
      });

      const result = await controller.findPublicImages(mockRequest, query);

      expect(result).toBeDefined();
    });
  });

  describe('getImageMetadata', () => {
    it('should return a public image by id', async () => {
      const mockImage = createIngredientDocumentFixture({
        id: imageId,
        category: IngredientCategory.IMAGE,
        scope: AssetScope.PUBLIC,
        status: IngredientStatus.GENERATED,
        url: 'https://example.com/image.jpg',
      });

      imagesService.findOne.mockResolvedValue(mockImage);

      const result = await controller.getImageMetadata(mockRequest, imageId);

      expect(imagesService.findOne).toHaveBeenCalledWith(
        {
          id: imageId,
          category: 'IMAGE',
          scope: AssetScope.PUBLIC,
          status: IngredientStatus.GENERATED,
        },
        expect.any(Array),
      );
      expect(result).toBeDefined();
    });

    it('should return 404 for invalid object id', async () => {
      const invalidId = 'invalid-id';

      const result = await controller.getImageMetadata(mockRequest, invalidId);

      expect(result).toEqual({
        errors: [
          {
            detail: `PublicImagesController ${invalidId} not found`,
            status: '404',
            title: 'Not Found',
          },
        ],
      });
      expect(imagesService.findOne).not.toHaveBeenCalled();
    });

    it('should return 404 when image not found', async () => {
      imagesService.findOne.mockResolvedValue(null);

      const result = await controller.getImageMetadata(mockRequest, imageId);

      expect(result).toEqual({
        errors: [
          {
            detail: `PublicImagesController ${imageId} not found`,
            status: '404',
            title: 'Not Found',
          },
        ],
      });
    });
  });

  describe('getImage (image.jpg download)', () => {
    it('should stream a public image', async () => {
      const mockImage = createIngredientDocumentFixture({
        id: imageId,
        category: IngredientCategory.IMAGE,
        scope: AssetScope.PUBLIC,
        status: IngredientStatus.GENERATED,
        url: 'https://example.com/image.jpg',
      });

      imagesService.findOne.mockResolvedValue(mockImage);
      filesClientService.getFileFromS3.mockResolvedValue(
        Readable.from(['jpeg-bytes']),
      );
      const { recorded, res } = createRecordedResponse();

      await controller.getImage(imageId, res);
      await finished(res as unknown as Writable);

      expect(imagesService.findOne).toHaveBeenCalledWith({
        id: imageId,
        category: 'IMAGE',
        scope: AssetScope.PUBLIC,
        status: IngredientStatus.GENERATED,
      });
      expect(filesClientService.getFileFromS3).toHaveBeenCalledWith(
        imageId,
        'images',
      );
      expect(recorded.status).toBe(200);
      expect(recorded.body).toBe('jpeg-bytes');
    });

    it('should return 404 for non-existent image', async () => {
      imagesService.findOne.mockResolvedValue(null);

      const { recorded, res } = createRecordedResponse();

      await controller.getImage(imageId, res);

      expect(recorded.status).toBe(404);
      expect(recorded.json).toEqual({ error: 'Image not found' });
    });

    it('should return 404 when S3 file not found', async () => {
      const mockImage = createIngredientDocumentFixture({
        id: imageId,
        category: IngredientCategory.IMAGE,
        scope: AssetScope.PUBLIC,
        status: IngredientStatus.GENERATED,
        url: 'https://example.com/image.jpg',
      });

      imagesService.findOne.mockResolvedValue(mockImage);
      filesClientService.getFileFromS3.mockRejectedValue(
        new Error('File not found in S3'),
      );

      const { recorded, res } = createRecordedResponse();

      await controller.getImage(imageId, res);

      expect(recorded.status).toBe(404);
      expect(recorded.json).toEqual({ error: 'Image file not found' });
    });
  });
});
