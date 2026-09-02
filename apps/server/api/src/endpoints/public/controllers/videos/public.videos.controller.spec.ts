vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type, id) => {
    const { HttpException, HttpStatus } = require('@nestjs/common');
    throw new HttpException(
      { detail: `${type} ${id} doesn't exist`, title: `${type} not found` },
      HttpStatus.NOT_FOUND,
    );
  }),
  serializeCollection: vi.fn((_req, _serializer, data) => data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));
vi.mock('@api/collections/videos/services/videos.service', () => ({
  VideosService: class {},
}));
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));

import { Readable } from 'node:stream';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { PublicVideosController } from '@api/endpoints/public/controllers/videos/public.videos.controller';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { AssetScope, IngredientCategory } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';

const mockRequest = {
  originalUrl: '/api/public/videos',
  params: {},
  query: {},
} as unknown as ExpressRequest;

const videoId = testId('video');
const brandId = testId('brand');

describe('PublicVideosController', () => {
  let controller: PublicVideosController;

  const mockVideosService = {
    findAll: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
    findOne: vi.fn(),
  };
  const mockFilesClientService = {
    getFileFromS3: vi.fn(),
  };
  const mockLoggerService = { error: vi.fn(), log: vi.fn() };

  // The TS enum now carries the Prisma labels verbatim, so stored rows and
  // controller filters share one vocabulary — no casing bridge is needed.
  const PRISMA_SCOPE_PUBLIC = AssetScope.PUBLIC;
  const PRISMA_SCOPE_USER = AssetScope.USER;

  /**
   * Stands in for the database honouring the controller's scope filter.
   * `storedScope` is what Postgres holds for the row; the controller supplies
   * the TS enum, which BaseService normalizes to the Prisma casing before the
   * query runs. A controller that drops the scope filter fails here.
   */
  const scopeFilteringFindOne =
    (storedScope: string) =>
    async (filter: Record<string, unknown>): Promise<unknown> => {
      const requested = filter.scope;

      if (typeof requested !== 'string') {
        throw new Error('Public video lookups must constrain scope');
      }

      return requested.toUpperCase() === storedScope
        ? { id: filter.id, scope: storedScope }
        : null;
    };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicVideosController],
      providers: [
        { provide: VideosService, useValue: mockVideosService },
        { provide: FilesClientService, useValue: mockFilesClientService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    controller = module.get<PublicVideosController>(PublicVideosController);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // --- findPublicVideos ---
  it('should return public videos collection', async () => {
    const result = await controller.findPublicVideos(mockRequest, {} as never);
    expect(result).toBeDefined();
    expect(mockVideosService.findAll).toHaveBeenCalled();
  });

  it('should pass the brand filter when a valid entity ID is provided', async () => {
    await controller.findPublicVideos(
      mockRequest,
      {} as never,
      undefined,
      brandId,
    );
    const aggregateArg = mockVideosService.findAll.mock.calls[0][0] as {
      where?: {
        brandId?: string;
      };
    };
    expect(aggregateArg.where?.brandId).toEqual(brandId);
  });

  it('should pass tag filter as regex when provided', async () => {
    await controller.findPublicVideos(mockRequest, {} as never, 'funny');
    const aggregateArg = mockVideosService.findAll.mock.calls[0][0] as {
      where?: {
        tags?: unknown;
      };
    };
    expect(aggregateArg.where?.tags).toEqual({
      some: { label: { contains: 'funny', mode: 'insensitive' } },
    });
  });

  it('should keep query-object shape when format is provided', async () => {
    await controller.findPublicVideos(
      mockRequest,
      {} as never,
      undefined,
      undefined,
      'portrait',
    );
    const aggregateArg = mockVideosService.findAll.mock.calls[0][0] as {
      orderBy?: Record<string, unknown>;
      where?: Record<string, unknown>;
    };
    expect(aggregateArg.where).toMatchObject({
      category: IngredientCategory.VIDEO,
      isDeleted: false,
      scope: AssetScope.PUBLIC,
    });
    expect(aggregateArg.orderBy).toEqual({ createdAt: -1 });
  });

  // --- getVideoMetadata ---
  it('should return video metadata for valid public video', async () => {
    mockVideosService.findOne.mockResolvedValue({
      id: videoId,
      category: IngredientCategory.VIDEO,
      scope: AssetScope.PUBLIC,
    });
    const result = await controller.getVideoMetadata(mockRequest, videoId);
    expect(result).toBeDefined();
  });

  it('should throw NOT_FOUND for an invalid entity ID', async () => {
    await expect(
      controller.getVideoMetadata(mockRequest, 'invalid-id'),
    ).rejects.toThrow(HttpException);
  });

  it('should throw NOT_FOUND when video does not exist', async () => {
    mockVideosService.findOne.mockResolvedValue(null);
    await expect(
      controller.getVideoMetadata(mockRequest, videoId),
    ).rejects.toThrow(HttpException);
  });

  // --- getVideo (stream) ---
  it('should stream video file from S3', async () => {
    mockVideosService.findOne.mockImplementation(
      scopeFilteringFindOne(PRISMA_SCOPE_PUBLIC),
    );
    const mockStream = new Readable({
      read() {
        this.push(null);
      },
    });
    (mockStream as unknown as { pipe: ReturnType<typeof vi.fn> }).pipe =
      vi.fn();
    mockFilesClientService.getFileFromS3.mockResolvedValue(mockStream);

    const mockRes = {
      set: vi.fn(),
    } as unknown as ExpressResponse;

    await controller.getVideo(videoId, mockRes);
    expect(mockFilesClientService.getFileFromS3).toHaveBeenCalledWith(
      videoId,
      'videos',
    );
    expect(mockRes.set).toHaveBeenCalledWith(
      expect.objectContaining({ 'Content-Type': 'video/mp4' }),
    );
  });

  it('should not stream a private video', async () => {
    mockVideosService.findOne.mockImplementation(
      scopeFilteringFindOne(PRISMA_SCOPE_USER),
    );
    const mockRes = { set: vi.fn() } as unknown as ExpressResponse;

    await expect(controller.getVideo(videoId, mockRes)).rejects.toThrow(
      HttpException,
    );
    expect(mockFilesClientService.getFileFromS3).not.toHaveBeenCalled();
  });

  it('should throw NOT_FOUND for an invalid entity ID on stream', async () => {
    const mockRes = { set: vi.fn() } as unknown as ExpressResponse;
    await expect(controller.getVideo('invalid-id', mockRes)).rejects.toThrow(
      HttpException,
    );
    expect(mockVideosService.findOne).not.toHaveBeenCalled();
  });

  it('should throw NOT_FOUND when video does not exist for stream', async () => {
    mockVideosService.findOne.mockResolvedValue(null);
    const mockRes = { set: vi.fn() } as unknown as ExpressResponse;
    await expect(controller.getVideo(videoId, mockRes)).rejects.toThrow(
      HttpException,
    );
  });
});
