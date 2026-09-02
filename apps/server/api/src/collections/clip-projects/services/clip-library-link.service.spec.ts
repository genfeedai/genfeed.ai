import type { CaptionsService } from '@api/collections/captions/services/captions.service';
import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { ClipLibraryLinkService } from '@api/collections/clip-projects/services/clip-library-link.service';
import type { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { MetadataService } from '@api/collections/metadata/services/metadata.service';
import {
  CaptionFormat,
  CaptionLanguage,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/contracts';
import { clipResultGenerationSource } from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';

function makeClip(
  overrides: Partial<ClipResultDocument> = {},
): ClipResultDocument {
  return {
    captionSrt: '1\n00:00:00,000 --> 00:00:03,000\nLaunch',
    captionedVideoS3Key: 'videos/clip-1-captioned.mp4',
    captionedVideoUrl: 'https://cdn.genfeed.ai/videos/clip-1-captioned.mp4',
    createdAt: new Date('2026-08-14T00:00:00.000Z'),
    data: {},
    duration: 10,
    endTime: 20,
    id: 'clip-1',
    isDeleted: false,
    isSelected: false,
    mode: 'raw-cut',
    organizationId: 'org-1',
    projectId: 'project-1',
    providerJobId: 'raw-cut-caption-clip-1',
    providerName: 'raw-cut',
    readiness: {},
    startTime: 10,
    status: 'completed',
    summary: 'A launch moment',
    terminalAt: new Date('2026-08-14T00:00:00.000Z'),
    title: 'Launch clip',
    updatedAt: new Date('2026-08-14T00:00:00.000Z'),
    userId: 'user-1',
    viralityScore: 88,
    ...overrides,
  } as ClipResultDocument;
}

describe('ClipLibraryLinkService', () => {
  let service: ClipLibraryLinkService;
  let captionsService: {
    create: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let clipProjectsService: { findOne: ReturnType<typeof vi.fn> };
  let clipResultsService: {
    claimLibraryIngredient: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    markLibraryLinkState: ReturnType<typeof vi.fn>;
  };
  let ingredientsService: {
    create: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let metadataService: {
    create: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    captionsService = {
      create: vi.fn().mockResolvedValue({ id: 'caption-1' }),
      patch: vi.fn().mockResolvedValue({ id: 'caption-1' }),
    };
    clipProjectsService = {
      findOne: vi.fn().mockResolvedValue({
        brandId: 'brand-1',
        id: 'project-1',
        organizationId: 'org-1',
      }),
    };
    clipResultsService = {
      claimLibraryIngredient: vi.fn().mockResolvedValue(true),
      findOne: vi.fn(),
      markLibraryLinkState: vi.fn().mockResolvedValue(undefined),
    };
    ingredientsService = {
      create: vi.fn().mockResolvedValue({ id: 'ingredient-1' }),
      findOne: vi.fn().mockResolvedValue(null),
      patch: vi.fn().mockResolvedValue(undefined),
    };
    metadataService = {
      create: vi.fn().mockResolvedValue({ id: 'metadata-1' }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    service = new ClipLibraryLinkService(
      captionsService as unknown as CaptionsService,
      clipProjectsService as unknown as ClipProjectsService,
      clipResultsService as unknown as ClipResultsService,
      ingredientsService as unknown as IngredientsService,
      {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      metadataService as unknown as MetadataService,
    );
  });

  it('creates one canonical video Ingredient that reuses rendered media keys', async () => {
    clipResultsService.findOne.mockResolvedValue(makeClip());

    await expect(
      service.linkReadyClip({
        clipResultId: 'clip-1',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      clipResultId: 'clip-1',
      ingredientId: 'ingredient-1',
      status: 'linked',
    });

    expect(metadataService.create).toHaveBeenCalledWith({
      description: 'A launch moment',
      duration: 10,
      extension: MetadataExtension.MP4,
      externalId: 'clip-1',
      externalProvider: 'clip-result',
      hasAudio: true,
      label: 'Launch clip',
      result: 'https://cdn.genfeed.ai/videos/clip-1-captioned.mp4',
    });
    expect(ingredientsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        category: IngredientCategory.VIDEO,
        cdnUrl: 'https://cdn.genfeed.ai/videos/clip-1-captioned.mp4',
        generationPrompt: 'Launch clip',
        generationSource: clipResultGenerationSource('clip-1'),
        generationStage: 'raw-cut',
        metadataId: 'metadata-1',
        mimeType: 'video/mp4',
        modelUsed: 'raw-cut',
        organizationId: 'org-1',
        s3Key: 'videos/clip-1-captioned.mp4',
        status: IngredientStatus.GENERATED,
        userId: 'user-1',
        workflowUsed: 'clip-project:project-1',
      }),
    );
    expect(captionsService.create).toHaveBeenCalledWith({
      format: CaptionFormat.SRT,
      ingredientId: 'ingredient-1',
      language: CaptionLanguage.EN,
    });
    expect(captionsService.patch).toHaveBeenCalledWith('caption-1', {
      content: '1\n00:00:00,000 --> 00:00:03,000\nLaunch',
    });
    expect(clipResultsService.claimLibraryIngredient).toHaveBeenCalledWith({
      clipResultId: 'clip-1',
      ingredientId: 'ingredient-1',
      organizationId: 'org-1',
    });
    expect(clipResultsService.markLibraryLinkState).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('resolves the existing asset on a repeated completion instead of duplicating', async () => {
    clipResultsService.findOne.mockResolvedValue(
      makeClip({
        ingredientId: 'ingredient-1',
        libraryLinkStatus: 'linked',
      }),
    );
    ingredientsService.findOne.mockResolvedValue({
      cdnUrl: 'https://cdn.genfeed.ai/videos/clip-1-captioned.mp4',
      id: 'ingredient-1',
      isDeleted: false,
      organizationId: 'org-1',
      s3Key: 'videos/clip-1-captioned.mp4',
    });

    await expect(
      service.linkReadyClip({
        clipResultId: 'clip-1',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      clipResultId: 'clip-1',
      ingredientId: 'ingredient-1',
      status: 'linked',
    });

    expect(ingredientsService.create).not.toHaveBeenCalled();
    expect(metadataService.create).not.toHaveBeenCalled();
    expect(clipResultsService.claimLibraryIngredient).toHaveBeenCalledWith({
      clipResultId: 'clip-1',
      ingredientId: 'ingredient-1',
      organizationId: 'org-1',
    });
  });

  it('finds an existing generation-source Ingredient when the FK is not yet claimed', async () => {
    clipResultsService.findOne.mockResolvedValue(makeClip());
    ingredientsService.findOne.mockResolvedValue({
      cdnUrl: 'https://cdn.genfeed.ai/videos/clip-1-captioned.mp4',
      id: 'ingredient-existing',
      isDeleted: false,
      organizationId: 'org-1',
      s3Key: 'videos/clip-1-captioned.mp4',
    });

    await expect(
      service.linkReadyClip({
        clipResultId: 'clip-1',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      clipResultId: 'clip-1',
      ingredientId: 'ingredient-existing',
      status: 'linked',
    });

    expect(ingredientsService.findOne).toHaveBeenCalledWith({
      generationSource: clipResultGenerationSource('clip-1'),
      isDeleted: false,
      organizationId: 'org-1',
    });
    expect(ingredientsService.create).not.toHaveBeenCalled();
    expect(clipResultsService.claimLibraryIngredient).toHaveBeenCalledWith({
      clipResultId: 'clip-1',
      ingredientId: 'ingredient-existing',
      organizationId: 'org-1',
    });
  });

  it('keeps the ready clip and records a retryable failure when linking throws', async () => {
    clipResultsService.findOne.mockResolvedValue(makeClip());
    ingredientsService.create.mockRejectedValue(
      new Error('Library write failed'),
    );

    await expect(
      service.linkReadyClip({
        clipResultId: 'clip-1',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      clipResultId: 'clip-1',
      error: 'Library write failed',
      status: 'failed',
    });

    expect(clipResultsService.markLibraryLinkState).toHaveBeenCalledWith({
      clipResultId: 'clip-1',
      error: 'Library write failed',
      organizationId: 'org-1',
      status: 'failed',
    });
    expect(clipResultsService.findOne).toHaveBeenCalledWith({
      id: 'clip-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
  });

  it('does not create a Library asset for a clip that is not ready', async () => {
    clipResultsService.findOne.mockResolvedValue(
      makeClip({ status: 'failed' }),
    );

    await expect(
      service.linkReadyClip({
        clipResultId: 'clip-1',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      clipResultId: 'clip-1',
      error: 'Clip result is not ready for Library linking.',
      status: 'failed',
    });

    expect(ingredientsService.create).not.toHaveBeenCalled();
  });

  it('does not leak a clip from another organization', async () => {
    clipResultsService.findOne.mockResolvedValue(null);

    await expect(
      service.linkReadyClip({
        clipResultId: 'clip-1',
        organizationId: 'org-other',
      }),
    ).resolves.toEqual({
      clipResultId: 'clip-1',
      error: 'Clip result was not found in this organization.',
      status: 'failed',
    });

    expect(ingredientsService.create).not.toHaveBeenCalled();
    expect(clipResultsService.markLibraryLinkState).not.toHaveBeenCalled();
  });

  it('soft-deletes a racing duplicate Ingredient and keeps the claimed winner', async () => {
    clipResultsService.findOne
      .mockResolvedValueOnce(makeClip())
      .mockResolvedValueOnce(
        makeClip({
          ingredientId: 'ingredient-winner',
          libraryLinkStatus: 'linked',
        }),
      );
    clipResultsService.claimLibraryIngredient.mockResolvedValue(false);
    ingredientsService.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        cdnUrl: 'https://cdn.genfeed.ai/videos/clip-1-captioned.mp4',
        id: 'ingredient-winner',
        isDeleted: false,
        organizationId: 'org-1',
        s3Key: 'videos/clip-1-captioned.mp4',
      });

    await expect(
      service.linkReadyClip({
        clipResultId: 'clip-1',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      clipResultId: 'clip-1',
      ingredientId: 'ingredient-winner',
      status: 'linked',
    });

    expect(ingredientsService.patch).toHaveBeenCalledWith('ingredient-1', {
      isDeleted: true,
    });
    expect(metadataService.patch).toHaveBeenCalledWith('metadata-1', {
      isDeleted: true,
    });
  });

  it('links an avatar clip from the provider URL without copying media bytes', async () => {
    clipResultsService.findOne.mockResolvedValue(
      makeClip({
        captionSrt: undefined,
        captionedVideoS3Key: undefined,
        captionedVideoUrl: undefined,
        mode: 'avatar',
        providerName: 'argil',
        videoS3Key: undefined,
        videoUrl: 'https://cdn.argil.ai/video-1.mp4',
      }),
    );

    await expect(
      service.linkReadyClip({
        clipResultId: 'clip-1',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      clipResultId: 'clip-1',
      ingredientId: 'ingredient-1',
      status: 'linked',
    });

    expect(ingredientsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        cdnUrl: 'https://cdn.argil.ai/video-1.mp4',
        generationStage: 'avatar',
        modelUsed: 'argil',
        s3Key: undefined,
      }),
    );
    expect(captionsService.create).not.toHaveBeenCalled();
  });
});
