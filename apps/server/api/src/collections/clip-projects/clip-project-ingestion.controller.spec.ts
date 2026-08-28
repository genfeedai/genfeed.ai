import { ClipProjectIngestionController } from '@api/collections/clip-projects/clip-project-ingestion.controller';
import { AnalyzeYoutubeDto } from '@api/collections/clip-projects/dto/analyze-youtube.dto';
import { CreateClipProjectFromYoutubeDto } from '@api/collections/clip-projects/dto/create-clip-project-from-youtube.dto';
import { PrepareClipUploadDto } from '@api/collections/clip-projects/dto/prepare-clip-upload.dto';
import type { ClipProjectIngestionService } from '@api/collections/clip-projects/services/clip-project-ingestion.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

describe('ClipProjectIngestionController', () => {
  const currentUser = {
    organizationId: 'org-1',
    userId: 'user-1',
  };
  let controller: ClipProjectIngestionController;
  let ingestionService: {
    analyzeYoutube: ReturnType<typeof vi.fn>;
    createFromYoutube: ReturnType<typeof vi.fn>;
    finalizeUpload: ReturnType<typeof vi.fn>;
    prepareUpload: ReturnType<typeof vi.fn>;
    retrySource: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    ingestionService = {
      analyzeYoutube: vi.fn().mockResolvedValue({
        identity: { source: 'missing' },
        projectId: 'project-1',
        status: 'analyzing',
      }),
      createFromYoutube: vi.fn().mockResolvedValue({
        batchJobId: 'clip-factory-project-1',
        estimatedClips: 10,
        projectId: 'project-1',
        status: 'processing',
      }),
      finalizeUpload: vi.fn().mockResolvedValue({
        batchJobId: 'clip-analysis-project-1',
        estimatedClips: 10,
        projectId: 'project-1',
        status: 'analyzing',
      }),
      prepareUpload: vi.fn().mockResolvedValue({
        expiresIn: 3600,
        ingredientId: 'ingredient-1',
        projectId: 'project-1',
        publicUrl: 'https://cdn.test/videos/ingredient-1',
        uploadUrl: 'https://uploads.test/ingredient-1',
      }),
      retrySource: vi.fn().mockResolvedValue({
        batchJobId: 'clip-analysis-project-1',
        estimatedClips: 10,
        projectId: 'project-1',
        status: 'queued',
      }),
    };
    controller = new ClipProjectIngestionController(
      {} as LoggerService,
      ingestionService as unknown as ClipProjectIngestionService,
    );
  });

  it('delegates YouTube factory ingestion with the authenticated user and DTO', async () => {
    const dto: CreateClipProjectFromYoutubeDto = {
      avatarId: 'avatar-1',
      voiceId: 'voice-1',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    };

    await expect(
      controller.createFromYoutube(currentUser as never, dto),
    ).resolves.toEqual({
      batchJobId: 'clip-factory-project-1',
      estimatedClips: 10,
      projectId: 'project-1',
      status: 'processing',
    });
    expect(ingestionService.createFromYoutube).toHaveBeenCalledWith(
      currentUser,
      dto,
    );
  });

  it('delegates YouTube analysis with the authenticated user and DTO', async () => {
    const dto: AnalyzeYoutubeDto = {
      brandId: 'brand-1',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    };

    await expect(
      controller.analyzeYoutube(currentUser as never, dto),
    ).resolves.toMatchObject({
      projectId: 'project-1',
      status: 'analyzing',
    });
    expect(ingestionService.analyzeYoutube).toHaveBeenCalledWith(
      currentUser,
      dto,
    );
  });

  it('preserves ingestion service errors', async () => {
    const error = new Error('Queue unavailable');
    ingestionService.createFromYoutube.mockRejectedValue(error);

    await expect(
      controller.createFromYoutube(currentUser as never, {
        avatarId: 'avatar-1',
        voiceId: 'voice-1',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    ).rejects.toBe(error);
  });

  it('delegates authenticated upload preparation and finalization', async () => {
    const dto: PrepareClipUploadDto = {
      contentType: 'video/mp4',
      filename: 'podcast.mp4',
      sizeBytes: 4_000_000_000,
    };

    await controller.prepareUpload(currentUser as never, dto);
    await controller.finalizeUpload(currentUser as never, 'project-1');

    expect(ingestionService.prepareUpload).toHaveBeenCalledWith(
      currentUser,
      dto,
    );
    expect(ingestionService.finalizeUpload).toHaveBeenCalledWith(
      currentUser,
      'project-1',
    );
  });

  describe('PrepareClipUploadDto validation', () => {
    it('accepts multi-gigabyte audio and video sources', () => {
      const video = plainToInstance(PrepareClipUploadDto, {
        contentType: 'video/mp4',
        filename: 'three-hour-podcast.mp4',
        sizeBytes: 4_000_000_000,
      });
      const audio = plainToInstance(PrepareClipUploadDto, {
        contentType: 'audio/mpeg',
        filename: 'three-hour-podcast.mp3',
        sizeBytes: 1_000_000_000,
      });

      expect(validateSync(video)).toEqual([]);
      expect(validateSync(audio)).toEqual([]);
    });

    it('rejects non-media MIME types and files above the upload ceiling', () => {
      const dto = plainToInstance(PrepareClipUploadDto, {
        contentType: 'application/zip',
        filename: 'archive.zip',
        sizeBytes: 11 * 1024 * 1024 * 1024,
      });

      expect(validateSync(dto).map((error) => error.property)).toEqual(
        expect.arrayContaining(['contentType', 'sizeBytes']),
      );
    });
  });

  describe('CreateClipProjectFromYoutubeDto validation', () => {
    it('allows saved avatar defaults and raw-cut requests to omit credentials', () => {
      const avatar = plainToInstance(CreateClipProjectFromYoutubeDto, {
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      });
      const rawCut = plainToInstance(CreateClipProjectFromYoutubeDto, {
        mode: 'raw-cut',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      });

      expect(validateSync(avatar)).toEqual([]);
      expect(validateSync(rawCut)).toEqual([]);
    });

    it('validates optional raw-cut credentials and the generation mode', () => {
      const invalid = plainToInstance(CreateClipProjectFromYoutubeDto, {
        avatarId: 123,
        mode: 'unknown',
        voiceId: false,
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      });

      expect(validateSync(invalid).map((error) => error.property)).toEqual(
        expect.arrayContaining(['avatarId', 'mode', 'voiceId']),
      );
    });

    it('rejects non-YouTube URLs', () => {
      const dto = plainToInstance(CreateClipProjectFromYoutubeDto, {
        youtubeUrl: 'https://example.com/not-youtube',
      });
      const messages = validateSync(dto).flatMap((error) =>
        Object.values(error.constraints ?? {}),
      );

      expect(messages).toContain('Must be a valid YouTube URL');
    });

    it.each(['did', 'tavus', 'musetalk'] as const)(
      'rejects unsupported avatar provider %s',
      (avatarProvider) => {
        const dto = plainToInstance(CreateClipProjectFromYoutubeDto, {
          avatarId: 'avatar-1',
          avatarProvider,
          voiceId: 'voice-1',
          youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
        });
        const messages = validateSync(dto).flatMap((error) =>
          Object.values(error.constraints ?? {}),
        );

        expect(messages).toContain(
          'avatarProvider must be one of the following values: heygen, argil, genfeedai',
        );
      },
    );
  });
});
