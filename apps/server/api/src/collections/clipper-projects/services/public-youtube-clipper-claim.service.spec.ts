import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import { PublicYoutubeClipperClaimService } from '@api/collections/clipper-projects/services/public-youtube-clipper-claim.service';
import type { PublicClipperToolStoreService } from '@api/services/public-clipper-tool/public-clipper-tool-store.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

type Row = Record<string, unknown> & { id: string };
type Session = Record<string, unknown>;

const token = 'a'.repeat(43);
const projectId = `public-youtube-clipper-${'f'.repeat(64)}`;
const user = {
  id: 'user-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as AuthenticatedUser;

const readySession = (): Session => ({
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

describe('PublicYoutubeClipperClaimService', () => {
  let brands: Row[];
  let projects: Map<string, Row>;
  let results: Row[];
  let sessionReads: number;
  let sessions: Map<string, Session>;
  let service: PublicYoutubeClipperClaimService;

  beforeEach(() => {
    brands = [
      { id: 'brand-1', isDeleted: false, organizationId: 'org-1' },
      { id: 'brand-foreign', isDeleted: false, organizationId: 'org-2' },
    ];
    projects = new Map();
    results = [];
    sessionReads = 0;
    sessions = new Map([[token, readySession()]]);

    const clipperProjects = {
      findOne: async (where: Row) => {
        const project = projects.get(where.id);
        return project &&
          project.organizationId === where.organizationId &&
          project.isDeleted === where.isDeleted
          ? project
          : null;
      },
    };
    const prisma = {
      // Writes stage in the transaction and only land if it commits.
      $transaction: async (
        callback: (transaction: unknown) => Promise<unknown>,
      ) => {
        const staged = { projects: [] as Row[], results: [] as Row[] };
        await callback({
          brand: {
            findFirst: async ({ where }: { where: Row }) =>
              brands.find(
                (brand) =>
                  brand.id === where.id &&
                  brand.organizationId === where.organizationId &&
                  brand.isDeleted === where.isDeleted,
              ) ?? null,
          },
          clipperProject: {
            create: async ({ data }: { data: Row }) => {
              staged.projects.push({ isDeleted: false, ...data });
            },
          },
          clipperResult: {
            create: async ({ data }: { data: Row }) => {
              staged.results.push(data);
            },
          },
        });
        for (const project of staged.projects) {
          projects.set(project.id, project);
        }
        results.push(...staged.results);
      },
    };
    const store = {
      deleteSession: async (previewToken: string) => {
        sessions.delete(previewToken);
      },
      getSession: async (previewToken: string) => {
        sessionReads += 1;
        return sessions.get(previewToken);
      },
      tokenHash: () => 'f'.repeat(64),
    };

    service = new PublicYoutubeClipperClaimService(
      clipperProjects as unknown as ClipperProjectsService,
      prisma as unknown as PrismaService,
      store as unknown as PublicClipperToolStoreService,
    );
  });

  it('creates the tenant-scoped project with its one preview result and consumes the session', async () => {
    const claimed = await service.claim({
      brandId: 'brand-1',
      previewToken: token,
      user,
    });

    expect(claimed).toBe(projects.get(projectId));
    expect(claimed).toMatchObject({
      brandId: 'brand-1',
      config: {
        source: {
          artifact: {
            mediaUrl: 'https://cdn.example/source.mp4',
            storageKey: 'clips/sources/source.mp4',
          },
          status: 'completed',
        },
        sourceVideoS3Key: 'clips/sources/source.mp4',
        sourceVideoUrl: 'https://cdn.example/source.mp4',
      },
      organizationId: 'org-1',
      readyClipCount: 1,
      status: 'completed',
      userId: 'user-1',
    });
    expect(results).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          videoUrl: 'https://cdn.example/preview.mp4',
        }),
        organizationId: 'org-1',
        projectId,
        status: 'completed',
        userId: 'user-1',
      }),
    ]);
    expect(sessions.has(token)).toBe(false);
  });

  it('returns the existing project for the same tenant and user without reading the session', async () => {
    const existing = {
      id: projectId,
      isDeleted: false,
      organizationId: 'org-1',
      userId: 'user-1',
    };
    projects.set(projectId, existing);

    await expect(service.claim({ previewToken: token, user })).resolves.toBe(
      existing,
    );
    expect(sessionReads).toBe(0);
    expect(results).toEqual([]);
    expect(sessions.has(token)).toBe(true);
  });

  it('keeps a preview that is still rendering and creates nothing', async () => {
    sessions.set(token, {
      highlights: [],
      preview: { jobId: 'preview-job-1', status: 'generating' },
      sourceVideoUrl: 'https://www.youtube.com/watch?v=abc12345',
      status: 'ready',
      transcriptSegments: [],
    });

    await expect(
      service.claim({ previewToken: token, user }),
    ).rejects.toMatchObject({
      response: { code: 'public_youtube_clipper_preview_in_progress' },
      status: 409,
    });
    expect(projects.size).toBe(0);
    expect(sessions.has(token)).toBe(true);
  });

  it('rejects a brand from another organization and creates nothing', async () => {
    await expect(
      service.claim({ brandId: 'brand-foreign', previewToken: token, user }),
    ).rejects.toThrow();
    expect(projects.size).toBe(0);
    expect(results).toEqual([]);
    expect(sessions.has(token)).toBe(true);
  });
});
