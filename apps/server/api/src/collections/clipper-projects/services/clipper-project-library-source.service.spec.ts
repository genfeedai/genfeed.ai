import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import type { ClipperProjectDocument } from '@api/collections/clipper-projects/schemas/clipper-project.schema';
import type { ClipperAnalysisWorkflowQueueService } from '@api/collections/clipper-projects/services/clipper-analysis-workflow-queue.service';
import type { ClipperIdentityResolutionService } from '@api/collections/clipper-projects/services/clipper-identity-resolution.service';
import { ClipperProjectLibrarySourceService } from '@api/collections/clipper-projects/services/clipper-project-library-source.service';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { ConfigService } from '@libs/config/config.service';

interface ProjectRow {
  dispatchFailedSource?: Record<string, unknown>;
  id: string;
  organizationId: string;
  source: Record<string, unknown>;
  [field: string]: unknown;
}

type IngredientRow = Record<string, unknown> & {
  id: string;
  isDeleted: boolean;
  organizationId: string;
};

describe('ClipperProjectLibrarySourceService', () => {
  const currentUser = {
    id: 'legacy-user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  };
  let ingredients: IngredientRow[];
  let projects: ProjectRow[];
  let queuedAnalyses: Record<string, unknown>[];
  let isQueueDown: boolean;
  let service: ClipperProjectLibrarySourceService;

  beforeEach(() => {
    ingredients = [];
    projects = [];
    queuedAnalyses = [];
    isQueueDown = false;
    const clipperProjectsService = {
      create: async (data: Omit<ProjectRow, 'id'>) => {
        const row = {
          ...data,
          id: `project-${projects.length + 1}`,
        } as ProjectRow;
        projects.push(row);
        return { ...row } as unknown as ClipperProjectDocument;
      },
      markSourceDispatchFailed: async (
        id: string,
        organizationId: string,
        source: Record<string, unknown>,
      ) => {
        const row = projects.find(
          (item) => item.id === id && item.organizationId === organizationId,
        );
        if (row) row.dispatchFailedSource = source;
      },
      patch: async (
        id: string,
        update: Partial<ProjectRow>,
        _populate: unknown,
        organizationId: string,
      ) => {
        const row = projects.find(
          (item) => item.id === id && item.organizationId === organizationId,
        );
        if (row) Object.assign(row, update);
        return row;
      },
    };
    const clipperAnalysisWorkflowQueue = {
      enqueue: async (job: Record<string, unknown>) => {
        if (isQueueDown) throw new Error('Queue unavailable');
        queuedAnalyses.push(job);
        return `clipper-analysis-${String(job.projectId)}`;
      },
    };
    const ingredientsService = {
      findOne: async (where: Record<string, unknown>) =>
        ingredients.find((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        ) ?? null,
    };
    service = new ClipperProjectLibrarySourceService(
      clipperProjectsService as unknown as ClipperProjectsService,
      clipperAnalysisWorkflowQueue as unknown as ClipperAnalysisWorkflowQueueService,
      {
        resolve: async () => ({ source: 'missing' }),
      } as unknown as ClipperIdentityResolutionService,
      ingredientsService as unknown as IngredientsService,
      { cdnUrl: 'https://cdn.test' } as unknown as ConfigService,
    );
  });

  describe('createFromIngredient', () => {
    const readyVideo: IngredientRow = {
      brandId: 'brand-1',
      category: 'VIDEO',
      id: 'video-1',
      isDeleted: false,
      metadata: { duration: 600, label: 'Launch keynote', size: 50_000_000 },
      mimeType: 'video/mp4',
      organizationId: 'org-1',
      s3Key: 'videos/video-1.mp4',
      status: 'GENERATED',
    };
    const libraryUser = { ...currentUser, brandId: 'brand-1' } as User;

    it('creates a Library-sourced project and queues analysis', async () => {
      ingredients = [readyVideo];

      await expect(
        service.createFromIngredient(libraryUser, { ingredientId: 'video-1' }),
      ).resolves.toMatchObject({ projectId: 'project-1', status: 'analyzing' });

      expect(projects).toEqual([
        expect.objectContaining({
          brandId: 'brand-1',
          name: 'Launch keynote',
          organizationId: 'org-1',
          settings: expect.objectContaining({ flow: 'review' }),
          source: expect.objectContaining({
            durationSeconds: 600,
            ingredientId: 'video-1',
            jobId: 'clipper-analysis-project-1',
            kind: 'library',
          }),
          sourceVideoS3Key: 'videos/video-1.mp4',
          status: 'pending',
        }),
      ]);
      expect(queuedAnalyses).toEqual([
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
      ]);
    });

    it('retains a recoverable failed project when its canonical analysis cannot be queued', async () => {
      ingredients = [readyVideo];
      isQueueDown = true;

      await expect(
        service.createFromIngredient(libraryUser, { ingredientId: 'video-1' }),
      ).rejects.toThrow('Queue unavailable');
      expect(projects).toEqual([
        expect.objectContaining({
          dispatchFailedSource: expect.objectContaining({
            jobId: 'clipper-analysis-project-1',
            kind: 'library',
          }),
          id: 'project-1',
        }),
      ]);
    });

    it('accepts an organization-shared asset from any brand', async () => {
      ingredients = [{ ...readyVideo, brandId: null }];

      await expect(
        service.createFromIngredient(libraryUser, {
          brandId: 'brand-2',
          ingredientId: 'video-1',
        }),
      ).resolves.toMatchObject({ projectId: 'project-1' });
      expect(projects[0]).toMatchObject({ brandId: 'brand-2' });
    });

    it.each([
      ['another brand asset', [{ ...readyVideo, brandId: 'brand-2' }]],
      [
        'another organization asset',
        [{ ...readyVideo, organizationId: 'org-2' }],
      ],
      ['a deleted asset', [{ ...readyVideo, isDeleted: true }]],
      ['a missing asset', []],
    ])('does not reveal %s', async (_label, rows) => {
      ingredients = rows;

      await expect(
        service.createFromIngredient(libraryUser, { ingredientId: 'video-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(projects).toEqual([]);
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
        ingredients = [{ ...readyVideo, ...overrides }];

        await expect(
          service.createFromIngredient(libraryUser, {
            ingredientId: 'video-1',
          }),
        ).rejects.toThrow(message);
        expect(projects).toEqual([]);
        expect(queuedAnalyses).toEqual([]);
      },
    );
  });
});
