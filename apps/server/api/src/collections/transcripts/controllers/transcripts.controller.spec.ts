vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { TranscriptsController } from '@api/collections/transcripts/controllers/transcripts.controller';
import { CreateTranscriptDto } from '@api/collections/transcripts/dto/create-transcript.dto';
import type { TranscriptEntity } from '@api/collections/transcripts/entities/transcript.entity';
import { TranscriptsService } from '@api/collections/transcripts/services/transcripts.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { User } from '@clerk/backend';
import { TranscriptStatus } from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('TranscriptsController', () => {
  let controller: TranscriptsController;
  let transcriptsService: vi.Mocked<TranscriptsService>;

  const mockUser = {
    id: 'user-123',
    publicMetadata: {
      brand: '507f191e810c19729de860ee'.toString(),
      isSuperAdmin: false,
      organization: '507f191e810c19729de860ee'.toString(),
      user: '507f191e810c19729de860ee'.toString(),
    } as IClerkPublicMetadata,
  } as unknown as User;

  const mockUserWithoutOrg = {
    id: 'user-456',
    publicMetadata: {
      brand: '507f191e810c19729de860ee'.toString(),
      isSuperAdmin: false,
      user: '507f191e810c19729de860ee'.toString(),
    } as IClerkPublicMetadata,
  } as unknown as User;

  const mockReq = {} as Request;

  const mockTranscript = {
    _id: '507f191e810c19729de860ee',
    isDeleted: false,
    organization: '507f191e810c19729de860ee',
    status: TranscriptStatus.PENDING,
    transcriptText: 'Test transcript',
    user: '507f191e810c19729de860ee',
    youtubeId: 'dQw4w9WgXcQ',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TranscriptsController],
      providers: [
        {
          provide: TranscriptsService,
          useValue: {
            createTranscript: vi.fn(),
            findOne: vi.fn(),
            findTranscripts: vi.fn(),
            updateOne: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TranscriptsController>(TranscriptsController);
    transcriptsService = module.get(TranscriptsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a transcript successfully', async () => {
      const createDto: CreateTranscriptDto = {
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      } as CreateTranscriptDto;

      transcriptsService.createTranscript.mockResolvedValue(
        mockTranscript as unknown as TranscriptEntity,
      );

      const result = await controller.create(mockReq, createDto, mockUser);

      expect(result).toEqual(mockTranscript);
      expect(transcriptsService.createTranscript).toHaveBeenCalledWith(
        createDto,
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
      );
    });

    it('should throw error when organization ID is missing', async () => {
      const createDto: CreateTranscriptDto = {
        youtubeUrl: 'https://www.youtube.com/watch?v=test',
      } as CreateTranscriptDto;

      await expect(
        controller.create(mockReq, createDto, mockUserWithoutOrg),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return paginated transcripts', async () => {
      const mockResult = {
        docs: [mockTranscript],
        limit: 20,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      };

      transcriptsService.findTranscripts.mockResolvedValue(
        mockResult as unknown as AggregatePaginateResult<unknown>,
      );

      const result = await controller.findAll(mockReq, mockUser, 1, 20);

      expect(result).toEqual(mockResult.docs);
      expect(transcriptsService.findTranscripts).toHaveBeenCalledWith(
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
        1,
        20,
      );
    });

    it('should use default pagination values', async () => {
      const mockResult = {
        docs: [],
        limit: 20,
        page: 1,
        totalDocs: 0,
        totalPages: 0,
      };

      transcriptsService.findTranscripts.mockResolvedValue(
        mockResult as unknown as AggregatePaginateResult<unknown>,
      );

      await controller.findAll(mockReq, mockUser);

      expect(transcriptsService.findTranscripts).toHaveBeenCalledWith(
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
        1,
        20,
      );
    });

    it('should throw error when organization ID is missing', async () => {
      await expect(
        controller.findAll(mockReq, mockUserWithoutOrg),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return a transcript by id', async () => {
      const transcriptId = '507f191e810c19729de860ee'.toString();
      transcriptsService.findOne.mockResolvedValue(
        mockTranscript as unknown as TranscriptEntity,
      );

      const result = await controller.findOne(mockReq, transcriptId, mockUser);

      expect(result).toEqual(mockTranscript);
      expect(transcriptsService.findOne).toHaveBeenCalledWith({
        _id: transcriptId,
        isDeleted: false,
        organization: mockUser.publicMetadata.organization,
      });
    });

    it('should return null when transcript not found (controller returns null)', async () => {
      const transcriptId = '507f191e810c19729de860ee'.toString();
      transcriptsService.findOne.mockResolvedValue(null);

      const result = await controller.findOne(mockReq, transcriptId, mockUser);

      // Controller calls serializeSingle with null, mock returns null
      expect(result).toBeNull();
    });

    it('should throw error when organization ID is missing', async () => {
      const transcriptId = '507f191e810c19729de860ee'.toString();

      await expect(
        controller.findOne(mockReq, transcriptId, mockUserWithoutOrg),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('should update transcript', async () => {
      const transcriptId = '507f191e810c19729de860ee'.toString();
      const updateDto = { transcriptText: 'Updated text' };

      transcriptsService.updateOne.mockResolvedValue({
        ...mockTranscript,
        transcriptText: 'Updated text',
      } as unknown as TranscriptEntity);

      const result = await controller.update(
        mockReq,
        transcriptId,
        updateDto,
        mockUser,
      );

      expect(result).toBeDefined();
      expect(result.transcriptText).toBe('Updated text');
    });

    it('should throw error when organization ID is missing', async () => {
      const transcriptId = '507f191e810c19729de860ee'.toString();
      const updateDto = { transcriptText: 'Updated text' };

      await expect(
        controller.update(mockReq, transcriptId, updateDto, mockUserWithoutOrg),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
