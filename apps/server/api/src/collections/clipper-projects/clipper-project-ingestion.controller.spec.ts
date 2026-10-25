import { ClipperProjectIngestionController } from '@api/collections/clipper-projects/clipper-project-ingestion.controller';
import type { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import { AnalyzeYoutubeDto } from '@api/collections/clipper-projects/dto/analyze-youtube.dto';
import { CreateClipperProjectFromIngredientDto } from '@api/collections/clipper-projects/dto/create-clipper-project-from-ingredient.dto';
import { CreateClipperProjectFromYoutubeDto } from '@api/collections/clipper-projects/dto/create-clipper-project-from-youtube.dto';
import { PrepareClipperUploadDto } from '@api/collections/clipper-projects/dto/prepare-clipper-upload.dto';
import { UpdateClipperProjectDto } from '@api/collections/clipper-projects/dto/update-clipper-project.dto';
import { UpdateClipperProjectDraftDto } from '@api/collections/clipper-projects/dto/update-clipper-project-draft.dto';
import type { ClipperProjectIngestionService } from '@api/collections/clipper-projects/services/clipper-project-ingestion.service';
import type { ClipperProjectLibrarySourceService } from '@api/collections/clipper-projects/services/clipper-project-library-source.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { Request } from 'express';

describe('ClipperProjectIngestionController', () => {
  const currentUser = {
    organizationId: 'org-1',
    userId: 'user-1',
  };
  let controller: ClipperProjectIngestionController;
  let clipperProjectsService: { saveDraft: ReturnType<typeof vi.fn> };
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
    clipperProjectsService = {
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
        batchJobId: 'clipper-factory-project-1',
        estimatedClips: 10,
        projectId: 'project-1',
        status: 'processing',
      }),
      finalizeUpload: vi.fn().mockResolvedValue({
        batchJobId: 'clipper-analysis-project-1',
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
        batchJobId: 'clipper-analysis-project-1',
        estimatedClips: 10,
        projectId: 'project-1',
        status: 'queued',
      }),
    };
    controller = new ClipperProjectIngestionController(
      {} as LoggerService,
      ingestionService as unknown as ClipperProjectIngestionService,
      clipperProjectsService as unknown as ClipperProjectsService,
      librarySourceService as unknown as ClipperProjectLibrarySourceService,
    );
  });

  const request = { originalUrl: '/clipper-projects/drafts' } as Request;

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
    const dto: UpdateClipperProjectDraftDto = {
      youtubeUrl: 'https://youtu.be/x',
    };

    const response = await controller.saveDraft(
      request,
      currentUser as never,
      'draft-1',
      dto,
    );

    expect(clipperProjectsService.saveDraft).toHaveBeenCalledWith(
      'draft-1',
      'org-1',
      dto,
    );
    expect(response).toMatchObject({ data: { id: 'draft-1' } });
  });

  it('delegates Library-sourced creation with the authenticated user', async () => {
    const dto: CreateClipperProjectFromIngredientDto = {
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
      const valid = plainToInstance(UpdateClipperProjectDraftDto, {
        filename: 'podcast.mp4',
        sourceKind: 'upload',
      });
      const invalid = plainToInstance(UpdateClipperProjectDraftDto, {
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
      const toDraft = plainToInstance(UpdateClipperProjectDto, {
        status: 'draft',
      });
      const toFailed = plainToInstance(UpdateClipperProjectDto, {
        status: 'failed',
      });

      expect(validateSync(toDraft).map((error) => error.property)).toContain(
        'status',
      );
      expect(validateSync(toFailed)).toEqual([]);
    });

    it('requires the Library asset id', () => {
      const dto = plainToInstance(CreateClipperProjectFromIngredientDto, {});

      expect(validateSync(dto).map((error) => error.property)).toContain(
        'ingredientId',
      );
    });
  });

  it('delegates YouTube factory ingestion with the authenticated user and DTO', async () => {
    const dto: CreateClipperProjectFromYoutubeDto = {
      avatarId: 'avatar-1',
      voiceId: 'voice-1',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    };

    await expect(
      controller.createFromYoutube(currentUser as never, dto),
    ).resolves.toEqual({
      batchJobId: 'clipper-factory-project-1',
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
    const dto: PrepareClipperUploadDto = {
      contentType: 'video/mp4',
      filename: 'podcast.mp4',
      sizeBytes: 4_000_000_000,
    };

    await controller.prepareUpload(currentUser as never, dto);
    await controller.finalizeUpload(currentUser as never, 'project-1', {
      ingredientId: 'ingredient-1',
    });

    expect(ingestionService.prepareUpload).toHaveBeenCalledWith(
      currentUser,
      dto,
    );
    expect(ingestionService.finalizeUpload).toHaveBeenCalledWith(
      currentUser,
      'project-1',
      'ingredient-1',
    );
  });

  describe('PrepareClipperUploadDto validation', () => {
    it('accepts multi-gigabyte audio and video sources', () => {
      const video = plainToInstance(PrepareClipperUploadDto, {
        contentType: 'video/mp4',
        filename: 'three-hour-podcast.mp4',
        sizeBytes: 4_000_000_000,
      });
      const audio = plainToInstance(PrepareClipperUploadDto, {
        contentType: 'audio/mpeg',
        filename: 'three-hour-podcast.mp3',
        sizeBytes: 1_000_000_000,
      });

      expect(validateSync(video)).toEqual([]);
      expect(validateSync(audio)).toEqual([]);
    });

    it('rejects non-media MIME types and files above the upload ceiling', () => {
      const dto = plainToInstance(PrepareClipperUploadDto, {
        contentType: 'application/zip',
        filename: 'archive.zip',
        sizeBytes: 11 * 1024 * 1024 * 1024,
      });

      expect(validateSync(dto).map((error) => error.property)).toEqual(
        expect.arrayContaining(['contentType', 'sizeBytes']),
      );
    });
  });

  describe('CreateClipperProjectFromYoutubeDto validation', () => {
    it('allows saved avatar defaults and raw-cut requests to omit credentials', () => {
      const avatar = plainToInstance(CreateClipperProjectFromYoutubeDto, {
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      });
      const rawCut = plainToInstance(CreateClipperProjectFromYoutubeDto, {
        mode: 'raw-cut',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      });

      expect(validateSync(avatar)).toEqual([]);
      expect(validateSync(rawCut)).toEqual([]);
    });

    it('validates optional raw-cut credentials and the generation mode', () => {
      const invalid = plainToInstance(CreateClipperProjectFromYoutubeDto, {
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
      const dto = plainToInstance(CreateClipperProjectFromYoutubeDto, {
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
        const dto = plainToInstance(CreateClipperProjectFromYoutubeDto, {
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
