import type { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import type { ClipperProjectDocument } from '@api/collections/clipper-projects/schemas/clipper-project.schema';
import { PublicYoutubeClipperClaimService } from '@api/collections/clipper-projects/services/public-youtube-clipper-claim.service';
import type { PublicClipperToolStoreService } from '@api/services/public-clipper-tool/public-clipper-tool-store.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

describe('PublicYoutubeClipperClaimService', () => {
  const project = {
    id: `public-youtube-clipper-${'f'.repeat(64)}`,
    organizationId: 'org-1',
    userId: 'user-1',
  } as ClipperProjectDocument;
  const clipperProjects = { findOne: vi.fn() };
  const clipperProjectCreate = vi.fn();
  const clipperResultCreate = vi.fn();
  const brandFindFirst = vi.fn();
  const prisma = {
    $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
      callback({
        brand: { findFirst: brandFindFirst },
        clipperProject: { create: clipperProjectCreate },
        clipperResult: { create: clipperResultCreate },
      }),
    ),
  };
  const store = {
    deleteSession: vi.fn(),
    getSession: vi.fn(),
    tokenHash: vi.fn().mockReturnValue('f'.repeat(64)),
  };
  let service: PublicYoutubeClipperClaimService;

  beforeEach(() => {
    vi.clearAllMocks();
    clipperProjects.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(project);
    brandFindFirst.mockResolvedValue({ id: 'brand-1' });
    store.getSession.mockResolvedValue({
      expiresAt: '2026-08-26T12:00:00.000Z',
      highlights: [
        {
          clip_type: 'educational',
          end_time: 40,
          id: 'moment-1',
          start_time: 10,
          summary: 'Useful moment',
          tags: ['creator'],
          title: 'A useful moment',
          virality_score: 80,
        },
      ],
      language: 'en',
      preview: {
        recommendationId: 'moment-1',
        status: 'ready',
        url: 'https://cdn.example/preview.mp4',
      },
      sourceArtifact: {
        contentType: 'video/mp4',
        mediaUrl: 'https://cdn.example/source.mp4',
        storageKey: 'clips/sources/source.mp4',
      },
      sourceFingerprint: 'source-fingerprint',
      sourceVideoS3Key: 'clips/sources/source.mp4',
      sourceVideoUrl: 'https://cdn.example/source.mp4',
      status: 'ready',
      transcriptSegments: [{ end: 5, start: 0, text: 'Transcript' }],
    });
    service = new PublicYoutubeClipperClaimService(
      clipperProjects as unknown as ClipperProjectsService,
      prisma as unknown as PrismaService,
      store as unknown as PublicClipperToolStoreService,
    );
  });

  it('atomically creates a tenant-scoped project and its one preview result', async () => {
    await expect(
      service.claim({
        brandId: 'brand-1',
        previewToken: 'a'.repeat(43),
        user: {
          id: 'user-1',
          organizationId: 'org-1',
          userId: 'user-1',
        } as never,
      }),
    ).resolves.toBe(project);

    expect(brandFindFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: { id: 'brand-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(clipperProjectCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brandId: 'brand-1',
        config: expect.objectContaining({
          source: expect.objectContaining({
            artifact: expect.objectContaining({
              mediaUrl: 'https://cdn.example/source.mp4',
              storageKey: 'clips/sources/source.mp4',
            }),
            status: 'completed',
          }),
          sourceVideoS3Key: 'clips/sources/source.mp4',
          sourceVideoUrl: 'https://cdn.example/source.mp4',
        }),
        id: project.id,
        organizationId: 'org-1',
        status: 'completed',
        userId: 'user-1',
      }),
    });
    expect(clipperResultCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        projectId: project.id,
        status: 'completed',
        userId: 'user-1',
      }),
    });
    expect(store.deleteSession).toHaveBeenCalledWith('a'.repeat(43));
  });

  it('is idempotent for the same tenant and canonical user', async () => {
    clipperProjects.findOne.mockReset().mockResolvedValue(project);

    await expect(
      service.claim({
        previewToken: 'a'.repeat(43),
        user: {
          id: 'user-1',
          organizationId: 'org-1',
          userId: 'user-1',
        } as never,
      }),
    ).resolves.toBe(project);

    expect(store.getSession).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not discard a preview that is still rendering during handoff', async () => {
    store.getSession.mockResolvedValueOnce({
      highlights: [],
      preview: { jobId: 'preview-job-1', status: 'generating' },
      sourceVideoUrl: 'https://www.youtube.com/watch?v=abc12345',
      status: 'ready',
      transcriptSegments: [],
    });

    await expect(
      service.claim({
        previewToken: 'a'.repeat(43),
        user: {
          id: 'user-1',
          organizationId: 'org-1',
          userId: 'user-1',
        } as never,
      }),
    ).rejects.toMatchObject({
      response: { code: 'public_youtube_clipper_preview_in_progress' },
      status: 409,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(store.deleteSession).not.toHaveBeenCalled();
  });
});
