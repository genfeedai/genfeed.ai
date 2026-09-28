import { ClipProjectIngestionController } from '@api/collections/clip-projects/clip-project-ingestion.controller';
import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { AnalyzeYoutubeDto } from '@api/collections/clip-projects/dto/analyze-youtube.dto';
import { CreateClipProjectFromIngredientDto } from '@api/collections/clip-projects/dto/create-clip-project-from-ingredient.dto';
import { CreateClipProjectFromYoutubeDto } from '@api/collections/clip-projects/dto/create-clip-project-from-youtube.dto';
import { PrepareClipUploadDto } from '@api/collections/clip-projects/dto/prepare-clip-upload.dto';
import { UpdateClipProjectDto } from '@api/collections/clip-projects/dto/update-clip-project.dto';
import { UpdateClipProjectDraftDto } from '@api/collections/clip-projects/dto/update-clip-project-draft.dto';
import type { ClipProjectIngestionService } from '@api/collections/clip-projects/services/clip-project-ingestion.service';
import type { ClipProjectLibrarySourceService } from '@api/collections/clip-projects/services/clip-project-library-source.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { Request } from 'express';

describe('ClipProjectIngestionController', () => {
  const currentUser = {
    organizationId: 'org-1',
    userId: 'user-1',
  };
  let controller: ClipProjectIngestionController;
  let clipProjectsService: { saveDraft: ReturnType<typeof vi.fn> };
  let librarySourceService: { createFromIngredient: ReturnType<typeof vi.fn> };
  let ingestionService: {
    analyzeYoutube: ReturnType<typeof vi.fn>;
    createDraft: ReturnType<typeof vi.fn>;
    createFromYoutube: ReturnType<typeof vi.fn>;
    finalizeUpload: ReturnType<typeof vi.fn>;
    prepareUpload: ReturnType<typeof vi.fn>;
    retrySource: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    clipProjectsService = {
      saveDraft: vi.fn().mockResolvedValue({
        draft: { sourceKind: 'youtube', youtubeUrl: 'https://youtu.be/x' },
        id: 'draft-1',
        status: 'draft',
      }),
    };
    librarySourceService = {
      createFromIngredient: vi.fn().mockResolvedValue({
        identity: { source: 'missing' },
        projectId: 'project-2',
        status: 'analyzing',
      }),
    };
    ingestionService = {
      analyzeYoutube: vi.fn().mockResolvedValue({
        identity: { source: 'missing' },
        projectId: 'project-1',
        status: 'analyzing',
      }),
      createDraft: vi.fn().mockResolvedValue({
        draft: { sourceKind: 'youtube' },
        id: 'draft-1',
        status: 'draft',
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
      clipProjectsService as unknown as ClipProjectsService,
      librarySourceService as unknown as ClipProjectLibrarySourceService,
    );
  });

  const request = { originalUrl: '/clip-projects/drafts' } as Request;

  it('creates a draft for the authenticated user and serializes it', async () => {
    const response = await controller.createDraft(
      request,
      currentUser as never,
      { brandId: 'brand-1' },
    );

    expect(ingestionService.createDraft).toHaveBeenCalledWith(currentUser, {
      brandId: 'brand-1',
    });
    expect(response).toMatchObject({
      data: {
        attributes: expect.objectContaining({
          draft: { sourceKind: 'youtube' },
          status: 'draft',
        }),
        id: 'draft-1',
      },
    });
  });

  it('autosaves a draft within the caller organization', async () => {
    const dto: UpdateClipProjectDraftDto = {
      youtubeUrl: 'https://youtu.be/x',
    };

    const response = await controller.saveDraft(
      request,
      currentUser as never,
      'draft-1',
      dto,
    );

    expect(clipProjectsService.saveDraft).toHaveBeenCalledWith(
      'draft-1',
      'org-1',
      dto,
    );
    expect(response).toMatchObject({ data: { id: 'draft-1' } });
  });

  it('delegates Library-sourced creation with the authenticated user', async () => {
    const dto: CreateClipProjectFromIngredientDto = {
      ingredientId: 'video-1',
    };

    await expect(
      controller.createFromIngredient(currentUser as never, dto),
    ).resolves.toMatchObject({ projectId: 'project-2', status: 'analyzing' });
    expect(librarySourceService.createFromIngredient).toHaveBeenCalledWith(
      currentUser,
      dto,
    );
  });

  describe('draft DTO validation', () => {
    it('accepts partial form autosaves and rejects out-of-range settings', () => {
      const valid = plainToInstance(UpdateClipProjectDraftDto, {
        filename: 'podcast.mp4',
        sourceKind: 'upload',
      });
      const invalid = plainToInstance(UpdateClipProjectDraftDto, {
        maxClips: 31,
        minViralityScore: -1,
        mode: 'unknown',
        sourceKind: 'library',
      });

      expect(validateSync(valid)).toEqual([]);
      expect(validateSync(invalid).map((error) => error.property)).toEqual(
        expect.arrayContaining([
          'maxClips',
          'minViralityScore',
          'mode',
          'sourceKind',
        ]),
      );
    });

    it('does not let the generic project update move a project back to draft', () => {
      const toDraft = plainToInstance(UpdateClipProjectDto, {
        status: 'draft',
      });
      const toFailed = plainToInstance(UpdateClipProjectDto, {
        status: 'failed',
      });

      expect(validateSync(toDraft).map((error) => error.property)).toContain(
        'status',
      );
      expect(validateSync(toFailed)).toEqual([]);
    });

    it('requires the Library asset id', () => {
      const dto = plainToInstance(CreateClipProjectFromIngredientDto, {});

      expect(validateSync(dto).map((error) => error.property)).toContain(
        'ingredientId',
      );
    });
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
