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

  it('should pass brand filter when valid ObjectId provided', async () => {
    const brandId = '507f1f77bcf86cd799439014';
    await controller.findPublicVideos(
      mockRequest,
      {} as never,
      undefined,
      brandId,
    );
    const aggregateArg = mockVideosService.findAll.mock.calls[0][0] as Array<{
      $match?: {
        brand?: string;
      };
    }>;
    const matchStage = aggregateArg[0];
    expect(matchStage.$match?.brand).toEqual(brandId);
  });

  it('should pass tag filter as regex when provided', async () => {
    await controller.findPublicVideos(mockRequest, {} as never, 'funny');
    const aggregateArg = mockVideosService.findAll.mock.calls[0][0] as Array<{
      $match?: {
        'metadata.tags'?: {
          $options: string;
          $regex: string;
        };
      };
    }>;
    const matchStage = aggregateArg[0];
    expect(matchStage.$match?.['metadata.tags']).toEqual({
      $options: 'i',
      $regex: 'funny',
    });
  });

  it('should include format expression pipeline stage when format provided', async () => {
    await controller.findPublicVideos(
      mockRequest,
      {} as never,
      undefined,
      undefined,
      'portrait',
    );
    const aggregateArg = mockVideosService.findAll.mock.calls[0][0] as Array<{
      $match?: {
        $expr?: unknown;
      };
    }>;
    // Should have extra $match stage for format
    const formatStage = aggregateArg.find((stage) => stage.$match?.$expr);
    expect(formatStage).toBeDefined();
  });

  // --- getVideoMetadata ---
  it('should return video metadata for valid public video', async () => {
    const videoId = '507f1f77bcf86cd799439011';
    mockVideosService.findOne.mockResolvedValue({
      _id: videoId,
      category: 'video',
      scope: 'public',
    });
    const result = await controller.getVideoMetadata(mockRequest, videoId);
    expect(result).toBeDefined();
  });

  it('should throw NOT_FOUND for invalid ObjectId', async () => {
    await expect(
      controller.getVideoMetadata(mockRequest, 'invalid-id'),
    ).rejects.toThrow(HttpException);
  });

  it('should throw NOT_FOUND when video does not exist', async () => {
    mockVideosService.findOne.mockResolvedValue(null);
    await expect(
      controller.getVideoMetadata(mockRequest, '507f1f77bcf86cd799439011'),
    ).rejects.toThrow(HttpException);
  });

  // --- getVideo (stream) ---
  it('should stream video file from S3', async () => {
    const videoId = '507f1f77bcf86cd799439011';
    mockVideosService.findOne.mockResolvedValue({ _id: videoId });
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

  it('should throw NOT_FOUND when video does not exist for stream', async () => {
    mockVideosService.findOne.mockResolvedValue(null);
    const mockRes = { set: vi.fn() } as unknown as ExpressResponse;
    await expect(
      controller.getVideo('507f1f77bcf86cd799439011', mockRes),
    ).rejects.toThrow(HttpException);
  });
});
