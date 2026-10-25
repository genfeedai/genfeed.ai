import type { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import type { ClipperProjectDocument } from '@api/collections/clipper-projects/schemas/clipper-project.schema';
import type { ClipperAnalysisWorkflowQueueService } from '@api/collections/clipper-projects/services/clipper-analysis-workflow-queue.service';
import type { ClipperIdentityResolutionService } from '@api/collections/clipper-projects/services/clipper-identity-resolution.service';
import { ClipperProjectLibrarySourceService } from '@api/collections/clipper-projects/services/clipper-project-library-source.service';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { ConfigService } from '@libs/config/config.service';

describe('ClipperProjectLibrarySourceService', () => {
  const currentUser = {
    id: 'legacy-user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  };
  let service: ClipperProjectLibrarySourceService;
  let clipperProjectsService: {
    create: ReturnType<typeof vi.fn>;
    markSourceDispatchFailed: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let clipperAnalysisWorkflowQueue: { enqueue: ReturnType<typeof vi.fn> };
  let ingredientsService: { findOne: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    clipperProjectsService = {
      create: vi.fn().mockResolvedValue({
        id: 'project-1',
      } as ClipperProjectDocument),
      patch: vi.fn(),
      markSourceDispatchFailed: vi.fn(),
    };
    clipperAnalysisWorkflowQueue = {
      enqueue: vi.fn().mockResolvedValue('clipper-analysis-project-1'),
    };
    ingredientsService = { findOne: vi.fn() };
    service = new ClipperProjectLibrarySourceService(
      clipperProjectsService as unknown as ClipperProjectsService,
      clipperAnalysisWorkflowQueue as unknown as ClipperAnalysisWorkflowQueueService,
      {
        resolve: vi.fn().mockResolvedValue({ source: 'missing' }),
      } as unknown as ClipperIdentityResolutionService,
      ingredientsService as unknown as IngredientsService,
      { cdnUrl: 'https://cdn.test' } as unknown as ConfigService,
    );
  });

  describe('createFromIngredient', () => {
    const readyVideo = {
      brandId: 'brand-1',
      category: 'VIDEO',
      id: 'video-1',
      metadata: { duration: 600, label: 'Launch keynote', size: 50_000_000 },
      mimeType: 'video/mp4',
      s3Key: 'videos/video-1.mp4',
      status: 'GENERATED',
    };
    const libraryUser = { ...currentUser, brandId: 'brand-1' };

    it('creates a Library-sourced project and queues analysis', async () => {
      ingredientsService.findOne.mockResolvedValue(readyVideo);

      await expect(
        service.createFromIngredient(libraryUser as never, {
          ingredientId: 'video-1',
        }),
      ).resolves.toMatchObject({ projectId: 'project-1', status: 'analyzing' });

      expect(ingredientsService.findOne).toHaveBeenCalledWith(
        { id: 'video-1', isDeleted: false, organizationId: 'org-1' },
        [{ path: 'metadata' }],
      );
      expect(clipperProjectsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-1',
          name: 'Launch keynote',
          organizationId: 'org-1',
          settings: expect.objectContaining({ flow: 'review' }),
          source: expect.objectContaining({
            durationSeconds: 600,
            ingredientId: 'video-1',
            kind: 'library',
          }),
          sourceVideoS3Key: 'videos/video-1.mp4',
          status: 'pending',
        }),
      );
      expect(clipperAnalysisWorkflowQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: 'org-1',
          projectId: 'project-1',
          source: expect.objectContaining({
            artifact: expect.objectContaining({
              storageKey: 'videos/video-1.mp4',
            }),
            jobId: 'clipper-analysis-project-1',
            kind: 'library',
          }),
          youtubeUrl: expect.stringContaining('videos/video-1.mp4'),
        }),
      );
    });

    it('retains a recoverable failed project when its canonical analysis cannot be queued', async () => {
      ingredientsService.findOne.mockResolvedValue(readyVideo);
      clipperAnalysisWorkflowQueue.enqueue.mockRejectedValue(
        new Error('Queue unavailable'),
      );
      await expect(
        service.createFromIngredient(libraryUser as never, {
          ingredientId: 'video-1',
        }),
      ).rejects.toThrow('Queue unavailable');
      expect(
        clipperProjectsService.markSourceDispatchFailed,
      ).toHaveBeenCalledWith(
        'project-1',
        'org-1',
        expect.objectContaining({
          jobId: 'clipper-analysis-project-1',
          kind: 'library',
        }),
      );
    });

    it('accepts an organization-shared asset from any brand', async () => {
      ingredientsService.findOne.mockResolvedValue({
        ...readyVideo,
        brandId: null,
      });

      await expect(
        service.createFromIngredient(libraryUser as never, {
          brandId: 'brand-2',
          ingredientId: 'video-1',
        }),
      ).resolves.toMatchObject({ projectId: 'project-1' });
    });

    it('does not reveal another brand asset or a missing one', async () => {
      ingredientsService.findOne.mockResolvedValueOnce({
        ...readyVideo,
        brandId: 'brand-2',
      });
      ingredientsService.findOne.mockResolvedValueOnce(null);

      await expect(
        service.createFromIngredient(libraryUser as never, {
          ingredientId: 'video-1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.createFromIngredient(libraryUser as never, {
          ingredientId: 'video-1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(clipperProjectsService.create).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a video shorter than the minimum',
        { metadata: { duration: 14, size: 1_000 } },
        'Clip sources must be at least 15 seconds long.',
      ],
      [
        'a video longer than six hours',
        { metadata: { duration: 6 * 60 * 60 + 1, size: 1_000 } },
        'Clip sources may be up to 6 hours long.',
      ],
      [
        'a video above 10 GB',
        { metadata: { duration: 600, size: 11 * 1024 * 1024 * 1024 } },
        'Clip sources may be up to 10 GB.',
      ],
      [
        'an image asset',
        { category: 'IMAGE', mimeType: 'image/png' },
        'Only video assets can be made into clips.',
      ],
      [
        'a video with a non-video MIME type',
        { mimeType: 'audio/mpeg' },
        'Only video assets can be made into clips.',
      ],
      [
        'a video still processing',
        { status: 'PROCESSING' },
        'This video is not ready yet. Make clips once it has finished processing.',
      ],
      [
        'a video without known duration',
        { metadata: { size: 1_000 } },
        'This video has no known duration.',
      ],
      [
        'a video without stored media',
        { metadata: { duration: 600 }, s3Key: null },
        'This video has no stored media.',
      ],
    ])(
      'refuses %s before any analysis starts',
      async (_label, overrides, message) => {
        ingredientsService.findOne.mockResolvedValue({
          ...readyVideo,
          ...overrides,
        });

        await expect(
          service.createFromIngredient(libraryUser as never, {
            ingredientId: 'video-1',
          }),
        ).rejects.toThrow(message);
        expect(clipperProjectsService.create).not.toHaveBeenCalled();
        expect(clipperAnalysisWorkflowQueue.enqueue).not.toHaveBeenCalled();
      },
    );
  });
});
