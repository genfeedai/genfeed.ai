import { CreateTranscriptDto } from '@api/collections/transcripts/dto/create-transcript.dto';
import { UpdateTranscriptDto } from '@api/collections/transcripts/dto/update-transcript.dto';
import { Transcript } from '@api/collections/transcripts/schemas/transcript.schema';
import { TranscriptsService } from '@api/collections/transcripts/services/transcripts.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { TranscriptStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('TranscriptsService', () => {
  let service: TranscriptsService;
  let model: ReturnType<typeof createMockModel>;
  let _logger: LoggerService;
  let fileQueueService: FileQueueService;

  const mockTranscript = {
    _id: '507f1f77bcf86cd799439011',
    createdAt: new Date(),
    isDeleted: false,
    organization: 'test-object-id',
    status: TranscriptStatus.PENDING,
    transcriptText: 'Test transcript text',
    updatedAt: new Date(),
    user: 'test-object-id',
    youtubeId: 'dQw4w9WgXcQ',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  };

  const mockModel = {
    aggregate: vi.fn(),
    aggregatePaginate: vi.fn(),
    collection: { name: 'transcripts' },
    create: vi.fn(),
    deleteMany: vi.fn(),
    exec: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndDelete: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    modelName: 'Transcript',
    populate: vi.fn(),
    save: vi.fn(),
    sort: vi.fn(),
    updateMany: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranscriptsService,
        { provide: PrismaService, useValue: mockModel },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: FileQueueService,
          useValue: {
            processFile: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TranscriptsService>(TranscriptsService);
    model = module.get(PrismaService);
    _logger = module.get<LoggerService>(LoggerService);
    fileQueueService = module.get<FileQueueService>(FileQueueService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTranscript', () => {
    it('should create a transcript and queue download job', async () => {
      const createDto: CreateTranscriptDto = {
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      } as CreateTranscriptDto;

      const userId = 'test-object-id'.toString();
      const organizationId = 'test-object-id'.toString();

      mockModel.create = vi.fn().mockResolvedValue(mockTranscript);
      model.create = mockModel.create;

      const result = await service.createTranscript(
        createDto,
        userId,
        organizationId,
      );

      expect(model.create).toHaveBeenCalledWith({
        isDeleted: false,
        organization: expect.any(string),
        status: TranscriptStatus.PENDING,
        transcriptText: '',
        user: expect.any(string),
        youtubeId: 'dQw4w9WgXcQ',
        youtubeUrl: createDto.youtubeUrl,
      });
      expect(fileQueueService.processFile).toHaveBeenCalledWith({
        ingredientId: expect.any(String),
        organizationId,
        params: {
          transcriptId: expect.any(String),
          youtubeId: 'dQw4w9WgXcQ',
          youtubeUrl: createDto.youtubeUrl,
        },
        type: 'youtube-download-audio',
        userId,
      });
      expect(result).toEqual(mockTranscript);
    });

    it('should handle different YouTube URL formats', async () => {
      const urls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtu.be/dQw4w9WgXcQ',
        'https://www.youtube.com/embed/dQw4w9WgXcQ',
        'https://www.youtube.com/v/dQw4w9WgXcQ',
      ];

      const userId = 'test-object-id'.toString();
      const organizationId = 'test-object-id'.toString();

      mockModel.create = vi.fn().mockResolvedValue(mockTranscript);
      model.create = mockModel.create;

      for (const url of urls) {
        const createDto: CreateTranscriptDto = {
          youtubeUrl: url,
        } as CreateTranscriptDto;

        await service.createTranscript(createDto, userId, organizationId);

        expect(model.create).toHaveBeenCalled();
      }
    });

    it('should throw error for invalid YouTube URL', async () => {
      const createDto: CreateTranscriptDto = {
        youtubeUrl: 'https://invalid-url.com',
      } as CreateTranscriptDto;

      const userId = 'test-object-id'.toString();
      const organizationId = 'test-object-id'.toString();

      await expect(
        service.createTranscript(createDto, userId, organizationId),
      ).rejects.toThrow('Invalid YouTube URL');
    });
  });

  describe('findTranscripts', () => {
    it('should find transcripts with pagination', async () => {
      const userId = 'test-object-id'.toString();
      const organizationId = 'test-object-id'.toString();

      const mockResult = {
        docs: [mockTranscript],
        limit: 20,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      };

      mockModel.aggregate = vi.fn().mockReturnValue({});
      mockModel.aggregatePaginate = vi.fn().mockResolvedValue(mockResult);
      model.aggregate = mockModel.aggregate;
      model.aggregatePaginate = mockModel.aggregatePaginate;

      const result = await service.findTranscripts(
        userId,
        organizationId,
        1,
        20,
      );

      expect(result).toEqual(mockResult);
      expect(model.aggregate).toHaveBeenCalledWith([
        {
          $match: {
            isDeleted: false,
            organization: expect.any(string),
          },
        },
        {
          $sort: { createdAt: -1 },
        },
      ]);
    });

    it('should use default pagination values', async () => {
      const userId = 'test-object-id'.toString();
      const organizationId = 'test-object-id'.toString();

      const mockResult = {
        docs: [],
        limit: 20,
        page: 1,
        totalDocs: 0,
        totalPages: 0,
      };

      mockModel.aggregate = vi.fn().mockReturnValue({});
      mockModel.aggregatePaginate = vi.fn().mockResolvedValue(mockResult);
      model.aggregate = mockModel.aggregate;
      model.aggregatePaginate = mockModel.aggregatePaginate;

      await service.findTranscripts(userId, organizationId);

      expect(model.aggregatePaginate).toHaveBeenCalledWith(expect.anything(), {
        limit: 20,
        page: 1,
      });
    });
  });

  describe('updateStatus', () => {
    it('should update transcript status', async () => {
      const transcriptId = 'test-object-id'.toString();
      const newStatus = TranscriptStatus.GENERATED;

      mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockTranscript),
      });
      model.findByIdAndUpdate = mockModel.findByIdAndUpdate;

      const result = await service.updateStatus(transcriptId, newStatus);

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        transcriptId,
        { status: newStatus },
        { returnDocument: 'after' },
      );
      expect(result).toEqual(mockTranscript);
    });

    it('should update status with error message', async () => {
      const transcriptId = 'test-object-id'.toString();
      const newStatus = TranscriptStatus.FAILED;
      const errorMessage = 'Download failed';

      mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockTranscript),
      });
      model.findByIdAndUpdate = mockModel.findByIdAndUpdate;

      await service.updateStatus(transcriptId, newStatus, errorMessage);

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        transcriptId,
        { error: errorMessage, status: newStatus },
        { returnDocument: 'after' },
      );
    });

    it('should throw error when transcript not found', async () => {
      const transcriptId = 'test-object-id'.toString();
      const newStatus = TranscriptStatus.GENERATED;

      mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });
      model.findByIdAndUpdate = mockModel.findByIdAndUpdate;

      await expect(
        service.updateStatus(transcriptId, newStatus),
      ).rejects.toThrow(`Transcript ${transcriptId} not found`);
    });
  });

  describe('updateTranscriptText', () => {
    it('should update transcript text and status', async () => {
      const transcriptId = 'test-object-id'.toString();
      const transcriptText = 'Updated transcript text';

      mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockTranscript),
      });
      model.findByIdAndUpdate = mockModel.findByIdAndUpdate;

      const result = await service.updateTranscriptText(
        transcriptId,
        transcriptText,
      );

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        transcriptId,
        {
          status: TranscriptStatus.GENERATING_ARTICLE,
          transcriptText,
        },
        { returnDocument: 'after' },
      );
      expect(result).toEqual(mockTranscript);
    });

    it('should update transcript with language', async () => {
      const transcriptId = 'test-object-id'.toString();
      const transcriptText = 'Updated transcript text';
      const language = 'en';

      mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockTranscript),
      });
      model.findByIdAndUpdate = mockModel.findByIdAndUpdate;

      await service.updateTranscriptText(
        transcriptId,
        transcriptText,
        language,
      );

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        transcriptId,
        {
          language,
          status: TranscriptStatus.GENERATING_ARTICLE,
          transcriptText,
        },
        { returnDocument: 'after' },
      );
    });

    it('should throw error when transcript not found', async () => {
      const transcriptId = 'test-object-id'.toString();
      const transcriptText = 'Updated transcript text';

      mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });
      model.findByIdAndUpdate = mockModel.findByIdAndUpdate;

      await expect(
        service.updateTranscriptText(transcriptId, transcriptText),
      ).rejects.toThrow(`Transcript ${transcriptId} not found`);
    });
  });

  describe('linkArticle', () => {
    it('should link article to transcript', async () => {
      const transcriptId = 'test-object-id'.toString();
      const articleId = 'test-object-id'.toString();

      mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockTranscript),
      });
      model.findByIdAndUpdate = mockModel.findByIdAndUpdate;

      const result = await service.linkArticle(transcriptId, articleId);

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        transcriptId,
        {
          article: expect.any(string),
          status: TranscriptStatus.GENERATED,
        },
        { returnDocument: 'after' },
      );
      expect(result).toEqual(mockTranscript);
    });

    it('should throw error when transcript not found', async () => {
      const transcriptId = 'test-object-id'.toString();
      const articleId = 'test-object-id'.toString();

      mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });
      model.findByIdAndUpdate = mockModel.findByIdAndUpdate;

      await expect(
        service.linkArticle(transcriptId, articleId),
      ).rejects.toThrow(`Transcript ${transcriptId} not found`);
    });
  });

  describe('updateOne', () => {
    it('should update transcript by filter', async () => {
      const filter = { youtubeId: 'dQw4w9WgXcQ' };
      const updateData: UpdateTranscriptDto = {
        status: TranscriptStatus.GENERATED,
      };

      mockModel.findOneAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockTranscript),
      });
      model.findOneAndUpdate = mockModel.findOneAndUpdate;

      const result = await service.updateOne(filter, updateData);

      expect(model.findOneAndUpdate).toHaveBeenCalledWith(filter, updateData, {
        returnDocument: 'after',
      });
      expect(result).toEqual(mockTranscript);
    });

    it('should throw error when transcript not found', async () => {
      const filter = { youtubeId: 'nonexistent' };
      const updateData: UpdateTranscriptDto = {
        status: TranscriptStatus.GENERATED,
      };

      mockModel.findOneAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });
      model.findOneAndUpdate = mockModel.findOneAndUpdate;

      await expect(service.updateOne(filter, updateData)).rejects.toThrow(
        'Transcript not found',
      );
    });
  });
});
