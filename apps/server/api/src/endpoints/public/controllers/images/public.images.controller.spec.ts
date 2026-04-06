import { ImagesService } from '@api/collections/images/services/images.service';
import { PublicImagesController } from '@api/endpoints/public/controllers/images/public.images.controller';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import { IngredientSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { Types } from 'mongoose';

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
const mockStream = {
  pipe: vi.fn(),
};

describe('PublicImagesController', () => {
  let controller: PublicImagesController;
  let filesClientService: vi.Mocked<FilesClientService>;
  let imagesService: vi.Mocked<ImagesService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockRequest = {
    originalUrl: '/api/public/images',
    query: {},
  } as unknown as ExpressRequest;

  const mockResponse = {
    json: vi.fn().mockReturnThis(),
    sendFile: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  } as unknown as ExpressResponse;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicImagesController],
      providers: [
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

    vi.spyOn(IngredientSerializer, 'serialize').mockImplementation((data) => ({
      data,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findPublicImages', () => {
    it('should return public images', async () => {
      const mockImages = {
        docs: [
          {
            _id: '1',
            category: IngredientCategory.IMAGE,
            scope: AssetScope.PUBLIC,
            status: IngredientStatus.GENERATED,
            url: 'https://example.com/image1.jpg',
          },
          {
            _id: '2',
            category: IngredientCategory.IMAGE,
            scope: AssetScope.PUBLIC,
            status: IngredientStatus.GENERATED,
            url: 'https://example.com/image2.jpg',
          },
        ],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: 2,
        totalPages: 1,
      };

      imagesService.findAll.mockResolvedValue(mockImages);

      const query: BaseQueryDto = {
        limit: 10,
        page: 1,
      };

      const result = await controller.findPublicImages(mockRequest, query);

      expect(imagesService.findAll).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              category: IngredientCategory.IMAGE,
              isDeleted: false,
              scope: AssetScope.PUBLIC,
              status: {
                $in: [IngredientStatus.GENERATED],
              },
            }),
          }),
        ]),
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
      const brandId = new Types.ObjectId().toString();
      const mockImages = {
        docs: [],
        totalDocs: 0,
      };

      imagesService.findAll.mockResolvedValue(mockImages);

      const query: BaseQueryDto = {
        limit: 10,
        page: 1,
      };

      await controller.findPublicImages(mockRequest, query, undefined, brandId);

      expect(imagesService.findAll).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              brand: new Types.ObjectId(brandId),
            }),
          }),
        ]),
        expect.any(Object),
      );
    });

    it('should filter by tag when provided', async () => {
      const tag = 'nature';
      const mockImages = {
        docs: [],
        totalDocs: 0,
      };

      imagesService.findAll.mockResolvedValue(mockImages);

      const query: BaseQueryDto = {
        limit: 10,
        page: 1,
      };

      await controller.findPublicImages(mockRequest, query, tag);

      expect(imagesService.findAll).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              'metadata.tags': { $options: 'i', $regex: tag },
            }),
          }),
        ]),
        expect.any(Object),
      );
    });

    it('should handle empty results', async () => {
      const mockImages = {
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: 0,
        totalPages: 0,
      };

      imagesService.findAll.mockResolvedValue(mockImages);

      const query: BaseQueryDto = {
        limit: 10,
        page: 1,
      };

      const result = await controller.findPublicImages(mockRequest, query);

      expect(result).toBeDefined();
    });
  });

  describe('getImageMetadata', () => {
    it('should return a public image by id', async () => {
      const imageId = new Types.ObjectId().toString();
      const mockImage = {
        _id: imageId,
        category: IngredientCategory.IMAGE,
        scope: AssetScope.PUBLIC,
        status: IngredientStatus.GENERATED,
        url: 'https://example.com/image.jpg',
      };

      imagesService.findOne.mockResolvedValue(mockImage);

      const result = await controller.getImageMetadata(mockRequest, imageId);

      expect(imagesService.findOne).toHaveBeenCalledWith(
        {
          _id: imageId,
          category: IngredientCategory.IMAGE,
          isDeleted: false,
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
      const imageId = new Types.ObjectId().toString();

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
      const imageId = new Types.ObjectId().toString();
      const mockImage = {
        _id: imageId,
        category: IngredientCategory.IMAGE,
        scope: AssetScope.PUBLIC,
        status: IngredientStatus.GENERATED,
        url: 'https://example.com/image.jpg',
      };

      imagesService.findOne.mockResolvedValue(mockImage);
      filesClientService.getFileFromS3.mockResolvedValue(
        mockStream as unknown as NodeJS.ReadableStream,
      );

      await controller.getImage(imageId, mockResponse);

      expect(imagesService.findOne).toHaveBeenCalledWith({
        _id: imageId,
        category: IngredientCategory.IMAGE,
        isDeleted: false,
        scope: AssetScope.PUBLIC,
        status: IngredientStatus.GENERATED,
      });
      expect(filesClientService.getFileFromS3).toHaveBeenCalledWith(
        imageId,
        'images',
      );
      expect(mockStream.pipe).toHaveBeenCalledWith(mockResponse);
    });

    it('should return 404 for non-existent image', async () => {
      const imageId = new Types.ObjectId().toString();

      imagesService.findOne.mockResolvedValue(null);

      await controller.getImage(imageId, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Image not found',
      });
    });

    it('should return 404 when S3 file not found', async () => {
      const imageId = new Types.ObjectId().toString();
      const mockImage = {
        _id: imageId,
        category: IngredientCategory.IMAGE,
        scope: AssetScope.PUBLIC,
        status: IngredientStatus.GENERATED,
        url: 'https://example.com/image.jpg',
      };

      imagesService.findOne.mockResolvedValue(mockImage);
      filesClientService.getFileFromS3.mockRejectedValue(
        new Error('File not found in S3'),
      );

      await controller.getImage(imageId, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Image file not found',
      });
    });
  });
});
