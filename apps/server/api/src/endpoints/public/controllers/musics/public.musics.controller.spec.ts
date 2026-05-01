import { Readable } from 'node:stream';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { PublicMusicsController } from '@api/endpoints/public/controllers/musics/public.musics.controller';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { AssetScope, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';

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

vi.mock('@genfeedai/serializers', () => ({
  MusicSerializer: {
    opts: {},
    serialize: vi.fn((data) => data),
  },
}));

describe('PublicMusicsController', () => {
  let controller: PublicMusicsController;
  let filesClientService: vi.Mocked<FilesClientService>;
  let musicsService: vi.Mocked<MusicsService>;

  const mockRequest = {
    originalUrl: '/api/public/musics',
    query: {},
  } as unknown as ExpressRequest;

  const mockResponse = {
    json: vi.fn().mockReturnThis(),
    pipe: vi.fn(),
    set: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  } as unknown as ExpressResponse;

  const mockStream = {
    pipe: vi.fn(),
  } as unknown as Readable;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicMusicsController],
      providers: [
        {
          provide: FilesClientService,
          useValue: {
            getFileFromS3: vi.fn(),
          },
        },
        {
          provide: MusicsService,
          useValue: {
            findAll: vi.fn(),
            findOne: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PublicMusicsController>(PublicMusicsController);
    filesClientService = module.get(FilesClientService);
    musicsService = module.get(MusicsService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findPublicMusics', () => {
    it('should return public musics list', async () => {
      const query: BaseQueryDto = { limit: 10, page: 1 };
      const mockMusics = {
        docs: [
          { _id: 'music1', title: 'Song 1' },
          { _id: 'music2', title: 'Song 2' },
        ],
        page: 1,
        totalDocs: 2,
      };

      musicsService.findAll.mockResolvedValue(mockMusics);

      const result = await controller.findPublicMusics(mockRequest, query);

      expect(musicsService.findAll).toHaveBeenCalled();
      expect(result).toEqual({ data: mockMusics.docs });
    });

    it('should filter by brand when provided', async () => {
      const query: BaseQueryDto = { limit: 10, page: 1 };
      const brandId = '507f191e810c19729de860ee'.toString();
      const mockMusics = {
        docs: [{ _id: 'music1', brand: brandId }],
        page: 1,
        totalDocs: 1,
      };

      musicsService.findAll.mockResolvedValue(mockMusics);

      await controller.findPublicMusics(mockRequest, query, undefined, brandId);

      const callArgs = musicsService.findAll.mock.calls[0][0];
      expect(callArgs[0].match.brand).toBeDefined();
    });

    it('should filter by tag when provided', async () => {
      const query: BaseQueryDto = { limit: 10, page: 1 };
      const tag = 'electronic';
      const mockMusics = {
        docs: [{ _id: 'music1', metadata: { tags: ['electronic'] } }],
        page: 1,
        totalDocs: 1,
      };

      musicsService.findAll.mockResolvedValue(mockMusics);

      await controller.findPublicMusics(mockRequest, query, tag);

      const callArgs = musicsService.findAll.mock.calls[0][0];
      expect(callArgs[0].match['metadata.tags']).toBeDefined();
      expect(callArgs[0].match['metadata.tags'].contains).toBe(tag);
    });
  });

  describe('getMusicMetadata', () => {
    it('should return music metadata for valid id', async () => {
      const musicId = '507f191e810c19729de860ee'.toString();
      const mockMusic = {
        _id: musicId,
        status: PostStatus.PUBLIC,
        title: 'Test Song',
      };

      musicsService.findOne.mockResolvedValue(mockMusic);

      // Controller signature: getMusicMetadata(@Req() request, @Param('musicId') musicId)
      const result = await controller.getMusicMetadata(mockRequest, musicId);

      expect(musicsService.findOne).toHaveBeenCalledWith(
        {
          _id: musicId,
          isDeleted: false,
          scope: AssetScope.PUBLIC,
          status: PostStatus.PUBLIC,
        },
        ['metadata', 'brand'],
      );
      expect(result).toEqual({ data: mockMusic });
    });

    it('should return not found for invalid object id', async () => {
      const invalidId = 'invalid-id';
      const responseUtil = await import(
        '@api/helpers/utils/response/response.util'
      );
      const returnNotFound = responseUtil.returnNotFound;

      const result = await controller.getMusicMetadata(mockRequest, invalidId);

      expect(musicsService.findOne).not.toHaveBeenCalled();
      expect(returnNotFound).toHaveBeenCalledWith(
        'PublicMusicsController',
        invalidId,
      );
      expect(result).toEqual({
        errors: [
          {
            detail: `PublicMusicsController ${invalidId} not found`,
            status: '404',
            title: 'Not Found',
          },
        ],
      });
    });

    it('should return not found when music does not exist', async () => {
      const musicId = '507f191e810c19729de860ee'.toString();
      const responseUtil = await import(
        '@api/helpers/utils/response/response.util'
      );
      const returnNotFound = responseUtil.returnNotFound;

      musicsService.findOne.mockResolvedValue(null);

      await controller.getMusicMetadata(mockRequest, musicId);

      expect(returnNotFound).toHaveBeenCalledWith(
        'PublicMusicsController',
        musicId,
      );
    });
  });

  describe('getMusic', () => {
    it('should stream music file successfully', async () => {
      const musicId = '507f191e810c19729de860ee'.toString();
      const mockMusic = {
        _id: musicId,
        status: PostStatus.PUBLIC,
      };

      musicsService.findOne.mockResolvedValue(mockMusic);
      filesClientService.getFileFromS3.mockResolvedValue(mockStream);

      // Controller signature: getMusic(@Param('musicId') musicId, @Res() res)
      await controller.getMusic(musicId, mockResponse);

      expect(musicsService.findOne).toHaveBeenCalledWith({
        _id: musicId,
        isDeleted: false,
        scope: AssetScope.PUBLIC,
        status: PostStatus.PUBLIC,
      });
      expect(filesClientService.getFileFromS3).toHaveBeenCalledWith(
        musicId,
        'musics',
      );
      expect(mockResponse.set).toHaveBeenCalledWith({
        'Cache-Control': 'public, max-age=3600',
        'Content-Disposition': `inline; filename="${musicId}.mp3"`,
        'Content-Type': 'audio/mpeg',
      });
      expect(mockStream.pipe).toHaveBeenCalledWith(mockResponse);
    });

    it('should return 404 when music not found', async () => {
      const musicId = '507f191e810c19729de860ee'.toString();

      musicsService.findOne.mockResolvedValue(null);

      await controller.getMusic(musicId, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Music not found',
      });
    });

    it('should handle S3 file retrieval error', async () => {
      const musicId = '507f191e810c19729de860ee'.toString();
      const mockMusic = {
        _id: musicId,
        status: PostStatus.PUBLIC,
      };

      musicsService.findOne.mockResolvedValue(mockMusic);
      filesClientService.getFileFromS3.mockRejectedValue(new Error('S3 error'));

      await controller.getMusic(musicId, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Music file not found',
      });
    });
  });
});
