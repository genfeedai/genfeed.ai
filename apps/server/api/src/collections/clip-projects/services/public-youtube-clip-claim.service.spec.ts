import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { ClipProjectDocument } from '@api/collections/clip-projects/schemas/clip-project.schema';
import { PublicYoutubeClipClaimService } from '@api/collections/clip-projects/services/public-youtube-clip-claim.service';
import type { PublicClipToolStoreService } from '@api/services/public-clip-tool/public-clip-tool-store.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

describe('PublicYoutubeClipClaimService', () => {
  const project = {
    id: `public-youtube-clip-${'f'.repeat(64)}`,
    organizationId: 'org-1',
    userId: 'user-1',
  } as ClipProjectDocument;
  const clipProjects = { findOne: vi.fn() };
  const clipProjectCreate = vi.fn();
  const clipResultCreate = vi.fn();
  const brandFindFirst = vi.fn();
  const prisma = {
    $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
      callback({
        brand: { findFirst: brandFindFirst },
        clipProject: { create: clipProjectCreate },
        clipResult: { create: clipResultCreate },
      }),
    ),
  };
  const store = {
    deleteSession: vi.fn(),
    getSession: vi.fn(),
    tokenHash: vi.fn().mockReturnValue('f'.repeat(64)),
  };
  let service: PublicYoutubeClipClaimService;

  beforeEach(() => {
    vi.clearAllMocks();
    clipProjects.findOne
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
    service = new PublicYoutubeClipClaimService(
      clipProjects as unknown as ClipProjectsService,
      prisma as unknown as PrismaService,
      store as unknown as PublicClipToolStoreService,
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
    expect(clipProjectCreate).toHaveBeenCalledWith({
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
    expect(clipResultCreate).toHaveBeenCalledWith({
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
    clipProjects.findOne.mockReset().mockResolvedValue(project);

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
      response: { code: 'public_youtube_clip_preview_in_progress' },
      status: 409,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(store.deleteSession).not.toHaveBeenCalled();
  });
});
