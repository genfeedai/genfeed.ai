import type { CaptionsService } from '@api/collections/captions/services/captions.service';
import type { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import { ClipperLibraryLinkService } from '@api/collections/clipper-projects/services/clipper-library-link.service';
import type { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import type { ClipperResultDocument } from '@api/collections/clipper-results/schemas/clipper-result.schema';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { MetadataService } from '@api/collections/metadata/services/metadata.service';
import {
  CaptionFormat,
  CaptionLanguage,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/contracts';
import { clipperResultGenerationSource } from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';

function makeClip(
  overrides: Partial<ClipperResultDocument> = {},
): ClipperResultDocument {
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
  } as ClipperResultDocument;
}

describe('ClipperLibraryLinkService', () => {
  let service: ClipperLibraryLinkService;
  let captionsService: {
    create: ReturnType<typeof vi.fn>;
    patchOneWhere: ReturnType<typeof vi.fn>;
  };
  let clipperProjectsService: { findOne: ReturnType<typeof vi.fn> };
  let clipperResultsService: {
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
      patchOneWhere: vi.fn().mockResolvedValue({ id: 'caption-1' }),
    };
    clipperProjectsService = {
      findOne: vi.fn().mockResolvedValue({
        brandId: 'brand-1',
        id: 'project-1',
        organizationId: 'org-1',
      }),
    };
    clipperResultsService = {
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

    service = new ClipperLibraryLinkService(
      captionsService as unknown as CaptionsService,
      clipperProjectsService as unknown as ClipperProjectsService,
      clipperResultsService as unknown as ClipperResultsService,
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
    clipperResultsService.findOne.mockResolvedValue(makeClip());

    await expect(
      service.linkReadyClip({
        clipperResultId: 'clip-1',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      clipperResultId: 'clip-1',
      ingredientId: 'ingredient-1',
      status: 'linked',
    });

    expect(metadataService.create).toHaveBeenCalledWith({
      description: 'A launch moment',
      duration: 10,
      extension: MetadataExtension.MP4,
      externalId: 'clip-1',
      externalProvider: 'clipper-result',
      hasAudio: true,
      label: 'Launch clip',
      result: 'https://cdn.genfeed.ai/videos/clip-1-captioned.mp4',
    });
    expect(ingredientsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        category: IngredientCategory.VIDEO,
        generationPrompt: 'Launch clip',
        generationSource: clipperResultGenerationSource('clip-1'),
        generationStage: 'raw-cut',
        metadataId: 'metadata-1',
        mimeType: 'video/mp4',
        modelUsed: 'raw-cut',
        organizationId: 'org-1',
        s3Key: 'videos/clip-1-captioned.mp4',
        status: IngredientStatus.GENERATED,
        userId: 'user-1',
        workflowUsed: 'clipper-project:project-1',
      }),
    );
    expect(captionsService.create).toHaveBeenCalledWith({
      format: CaptionFormat.SRT,
      ingredientId: 'ingredient-1',
      isDeleted: false,
      language: CaptionLanguage.EN,
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(captionsService.patchOneWhere).toHaveBeenCalledWith(
      { id: 'caption-1', isDeleted: false, organizationId: 'org-1' },
      { content: '1\n00:00:00,000 --> 00:00:03,000\nLaunch' },
    );
    expect(clipperResultsService.claimLibraryIngredient).toHaveBeenCalledWith({
      clipperResultId: 'clip-1',
      ingredientId: 'ingredient-1',
      organizationId: 'org-1',
    });
    expect(clipperResultsService.markLibraryLinkState).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('resolves the existing asset on a repeated completion instead of duplicating', async () => {
    clipperResultsService.findOne.mockResolvedValue(
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
        clipperResultId: 'clip-1',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      clipperResultId: 'clip-1',
      ingredientId: 'ingredient-1',
      status: 'linked',
    });

    expect(ingredientsService.create).not.toHaveBeenCalled();
    expect(metadataService.create).not.toHaveBeenCalled();
    expect(clipperResultsService.claimLibraryIngredient).toHaveBeenCalledWith({
      clipperResultId: 'clip-1',
      ingredientId: 'ingredient-1',
      organizationId: 'org-1',
    });
  });

  it('finds an existing generation-source Ingredient when the FK is not yet claimed', async () => {
    clipperResultsService.findOne.mockResolvedValue(makeClip());
    ingredientsService.findOne.mockResolvedValue({
      cdnUrl: 'https://cdn.genfeed.ai/videos/clip-1-captioned.mp4',
      id: 'ingredient-existing',
      isDeleted: false,
      organizationId: 'org-1',
      s3Key: 'videos/clip-1-captioned.mp4',
    });

    await expect(
      service.linkReadyClip({
        clipperResultId: 'clip-1',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      clipperResultId: 'clip-1',
      ingredientId: 'ingredient-existing',
      status: 'linked',
    });

    expect(ingredientsService.findOne).toHaveBeenCalledWith({
      generationSource: clipperResultGenerationSource('clip-1'),
      isDeleted: false,
      organizationId: 'org-1',
    });
    expect(ingredientsService.create).not.toHaveBeenCalled();
    expect(clipperResultsService.claimLibraryIngredient).toHaveBeenCalledWith({
      clipperResultId: 'clip-1',
      ingredientId: 'ingredient-existing',
      organizationId: 'org-1',
    });
  });

  it('keeps the ready clip and records a retryable failure when linking throws', async () => {
    clipperResultsService.findOne.mockResolvedValue(makeClip());
    ingredientsService.create.mockRejectedValue(
      new Error('Library write failed'),
    );

    await expect(
      service.linkReadyClip({
        clipperResultId: 'clip-1',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      clipperResultId: 'clip-1',
      error: 'Library write failed',
      status: 'failed',
    });

    expect(clipperResultsService.markLibraryLinkState).toHaveBeenCalledWith({
      clipperResultId: 'clip-1',
      error: 'Library write failed',
      organizationId: 'org-1',
      status: 'failed',
    });
    expect(clipperResultsService.findOne).toHaveBeenCalledWith({
      id: 'clip-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
  });

  it('does not create a Library asset for a clip that is not ready', async () => {
    clipperResultsService.findOne.mockResolvedValue(
      makeClip({ status: 'failed' }),
    );

    await expect(
      service.linkReadyClip({
        clipperResultId: 'clip-1',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      clipperResultId: 'clip-1',
      error: 'Clip result is not ready for Library linking.',
      status: 'failed',
    });

    expect(ingredientsService.create).not.toHaveBeenCalled();
  });

  it('does not leak a clip from another organization', async () => {
    clipperResultsService.findOne.mockResolvedValue(null);

    await expect(
      service.linkReadyClip({
        clipperResultId: 'clip-1',
        organizationId: 'org-other',
      }),
    ).resolves.toEqual({
      clipperResultId: 'clip-1',
      error: 'Clip result was not found in this organization.',
      status: 'failed',
    });

    expect(ingredientsService.create).not.toHaveBeenCalled();
    expect(clipperResultsService.markLibraryLinkState).not.toHaveBeenCalled();
  });

  it('soft-deletes a racing duplicate Ingredient and keeps the claimed winner', async () => {
    clipperResultsService.findOne
      .mockResolvedValueOnce(makeClip())
      .mockResolvedValueOnce(
        makeClip({
          ingredientId: 'ingredient-winner',
          libraryLinkStatus: 'linked',
        }),
      );
    clipperResultsService.claimLibraryIngredient.mockResolvedValue(false);
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
        clipperResultId: 'clip-1',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      clipperResultId: 'clip-1',
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
    clipperResultsService.findOne.mockResolvedValue(
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
        clipperResultId: 'clip-1',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      clipperResultId: 'clip-1',
      ingredientId: 'ingredient-1',
      status: 'linked',
    });

    // Provider-hosted media has no object key; its link lives on the
    // metadata row, and reads fall back to it.
    expect(ingredientsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        generationStage: 'avatar',
        modelUsed: 'argil',
        s3Key: undefined,
      }),
    );
    expect(ingredientsService.create.mock.calls[0]?.[0]).not.toHaveProperty(
      'cdnUrl',
    );
    expect(metadataService.create).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'https://cdn.argil.ai/video-1.mp4' }),
    );
    expect(captionsService.create).not.toHaveBeenCalled();
  });
});
