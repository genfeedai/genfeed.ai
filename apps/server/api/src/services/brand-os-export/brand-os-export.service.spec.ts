import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandOsExportService } from '@api/services/brand-os-export/brand-os-export.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const actor: AuthenticatedUser = {
  brandId: 'brand-1',
  id: 'user-1',
  organizationId: 'org-1',
  userId: 'user-1',
};
const approved = (id = 'rev-1', version = 1) => ({
  approvedAt: new Date('2026-09-14T00:00:00Z'),
  approvedById: 'user-1',
  brandId: 'brand-1',
  content: {
    fields: {
      label: {
        currentValue: `Brand ${version}`,
        evidence: [{ sourceType: 'manual' }],
      },
    },
  },
  createdAt: new Date(),
  exportSchemaVersion: '1',
  id,
  isDeleted: false,
  organizationId: 'org-1',
  sourcePreviewTokenHash: null,
  status: 'APPROVED',
  updatedAt: new Date(),
  version,
});
type Publication = {
  brand: { organizationId: string };
  brandId: string;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  publishedAt: Date;
  publishedById: string;
  publishedRevisionIds: string[];
  revisionId: string;
  revokedAt: Date | null;
  revokedById: string | null;
};

describe('Brand OS export publication boundary', () => {
  let publication: Publication | null;
  let revisions: ReturnType<typeof approved>[];
  let service: BrandOsExportService;
  let db: ReturnType<typeof database>;
  let log: ReturnType<typeof vi.fn>;
  function database() {
    return {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'brand-1' }]),
      $transaction: vi.fn(),
      activity: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
      brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand-1' }) },
      member: {
        findFirst: vi.fn().mockResolvedValue({ roleKey: MemberRole.OWNER }),
      },
      brandOsRevision: {
        findFirst: vi
          .fn()
          .mockImplementation((args: Prisma.BrandOsRevisionFindFirstArgs) => {
            const where = args.where;
            return (
              revisions.find(
                (revision) =>
                  (!where?.id || revision.id === where.id) &&
                  (where?.status !== 'APPROVED' ||
                    revision.status === 'APPROVED'),
              ) ?? null
            );
          }),
      },
      brandOsPublication: {
        findFirst: vi
          .fn()
          .mockImplementation((args: Prisma.BrandOsPublicationFindFirstArgs) =>
            publication &&
            (!args.where?.id || publication.id === args.where.id) &&
            (args.where?.revokedAt !== null || !publication.revokedAt) &&
            !publication.isDeleted
              ? publication
              : null,
          ),
        upsert: vi
          .fn()
          .mockImplementation(
            (args: {
              create: Omit<
                Publication,
                | 'id'
                | 'brand'
                | 'publishedAt'
                | 'revokedAt'
                | 'revokedById'
                | 'isDeleted'
              >;
              update: Partial<Publication>;
            }) => {
              publication = publication
                ? { ...publication, ...args.update }
                : {
                    ...args.create,
                    brand: { organizationId: 'org-1' },
                    id: 'pub-1',
                    isDeleted: false,
                    publishedAt: new Date(),
                    revokedAt: null,
                    revokedById: null,
                  };
              return publication;
            },
          ),
        updateMany: vi
          .fn()
          .mockImplementation((args: { data: Partial<Publication> }) => {
            if (!publication || publication.revokedAt) return { count: 0 };
            publication = { ...publication, ...args.data };
            return { count: 1 };
          }),
      },
    };
  }
  beforeEach(() => {
    publication = null;
    revisions = [approved()];
    db = database();
    db.$transaction.mockImplementation(
      (work: (tx: typeof db) => Promise<void>) => work(db),
    );
    log = vi.fn();
    service = new BrandOsExportService(
      db as unknown as PrismaService,
      { get: () => 'https://api.example.com/v1' } as unknown as ConfigService,
      { log } as unknown as LoggerService,
    );
  });
  it('returns unavailable without approved revisions, then private member download', async () => {
    revisions = [];
    expect((await service.state('brand-1', actor)).state).toBe('unavailable');
    await expect(service.download('brand-1', actor)).rejects.toMatchObject({
      status: 404,
    });
    revisions = [approved()];
    expect((await service.state('brand-1', actor)).state).toBe('private');
    const first = await service.download('brand-1', actor);
    expect(await service.download('brand-1', actor)).toEqual(first);
    await expect(service.publicArtifact('pub-1')).rejects.toMatchObject({
      status: 404,
    });
  });
  it('pins publication, explicitly republishes, preserves immutable URLs, and revokes all', async () => {
    const state = await service.publish('brand-1', 'rev-1', actor);
    expect(state.state).toBe('published');
    expect(state.publicUrl).toBe(
      'https://api.example.com/v1/public/brand-os/pub-1/design.md',
    );
    const original = await service.publicArtifact('pub-1');
    revisions[0].status = 'SUPERSEDED';
    revisions.unshift(approved('rev-2', 2));
    expect((await service.state('brand-1', actor)).revisionId).toBe('rev-2');
    expect(await service.publicArtifact('pub-1')).toEqual(original);
    await service.publish('brand-1', 'rev-2', actor);
    expect((await service.publicArtifact('pub-1')).revisionId).toBe('rev-2');
    expect(await service.publicArtifact('pub-1', 'rev-1')).toEqual(original);
    await expect(
      service.publicArtifact('pub-1', 'never-published'),
    ).rejects.toMatchObject({ status: 404 });
    expect((await service.revoke('brand-1', actor)).state).toBe('revoked');
    await expect(service.publicArtifact('pub-1')).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      service.publicArtifact('pub-1', 'rev-1'),
    ).rejects.toMatchObject({ status: 404 });
    expect((await service.download('brand-1', actor)).revisionId).toBe('rev-2');
    await service.publish('brand-1', 'rev-2', actor);
    await expect(
      service.publicArtifact('pub-1', 'rev-1'),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('keeps publication and revocation timestamps stable on retries', async () => {
    await service.publish('brand-1', 'rev-1', actor);
    const initial = publication;
    await service.publish('brand-1', 'rev-1', actor);
    expect(publication).toEqual(initial);
    expect(db.brandOsPublication.upsert).toHaveBeenCalledTimes(1);
    await service.revoke('brand-1', actor);
    const revoked = publication;
    await service.revoke('brand-1', actor);
    expect(publication).toEqual(revoked);
  });
  it('denies nonmembers and anonymous callers without existence metadata', async () => {
    db.member.findFirst.mockResolvedValue(null);
    await expect(service.state('brand-1', actor)).rejects.toMatchObject({
      status: 404,
      message: 'Not found',
    });
    await expect(service.download('brand-1', actor)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      service.state('brand-1', undefined as unknown as AuthenticatedUser),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.brandOsRevision.findFirst).not.toHaveBeenCalled();
  });
  it('permits members to download but requires administrators for publication changes', async () => {
    db.member.findFirst.mockResolvedValue({ roleKey: MemberRole.USER });
    expect((await service.state('brand-1', actor)).canPublish).toBe(false);
    await service.download('brand-1', actor);
    await expect(
      service.publish('brand-1', 'rev-1', actor),
    ).rejects.toMatchObject({ status: 404 });
    await expect(service.revoke('brand-1', actor)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('scopes membership and revision queries and rejects a moved public brand', async () => {
    await service.publish('brand-1', 'rev-1', actor);
    expect(db.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          isDeleted: false,
          organizationId: 'org-1',
          userId: 'user-1',
        },
      }),
    );
    expect(db.brandOsRevision.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    if (publication) publication.brand.organizationId = 'other-org';
    await expect(service.publicArtifact('pub-1')).rejects.toMatchObject({
      status: 404,
    });
  });
  it('filters soft deleted public brands and organizations and locks writes to live brands', async () => {
    await service.publish('brand-1', 'rev-1', actor);
    await service.publicArtifact('pub-1');
    expect(db.brandOsPublication.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brand: { isDeleted: false },
          organization: { isDeleted: false },
          revokedAt: null,
        }),
      }),
    );
    db.$queryRaw.mockResolvedValue([]);
    await expect(service.revoke('brand-1', actor)).rejects.toMatchObject({
      status: 404,
    });
    expect(db.brandOsPublication.updateMany).not.toHaveBeenCalled();
  });
  it('records scoped durable audit events with no artifact data or content in logs', async () => {
    await service.download('brand-1', actor);
    await service.publish('brand-1', 'rev-1', actor);
    await service.revoke('brand-1', actor);
    expect(db.activity.create).toHaveBeenCalledTimes(3);
    for (const [args] of db.activity.create.mock.calls) {
      expect(args.data).toMatchObject({
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      });
      expect(Object.keys(args.data).sort()).toEqual([
        'action',
        'brandId',
        'entityId',
        'entityModel',
        'organizationId',
        'userId',
      ]);
    }
    expect(JSON.stringify(log.mock.calls)).not.toContain('Brand 1');
  });
  it('retries serialization conflicts and returns a bounded retryable conflict', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('conflict', {
      clientVersion: 'test',
      code: 'P2034',
    });
    db.$transaction.mockRejectedValueOnce(conflict);
    await service.publish('brand-1', 'rev-1', actor);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    db.$transaction.mockRejectedValue(conflict);
    await expect(service.revoke('brand-1', actor)).rejects.toMatchObject({
      status: 409,
    });
  });
  it.each(['malformed', 'unknown-schema'] as const)(
    'reports unavailable for %s approved artifacts without hiding revision metadata',
    async (kind) => {
      if (kind === 'malformed')
        revisions[0].content.fields.label.currentValue = '';
      else revisions[0].exportSchemaVersion = 'future';
      expect(await service.state('brand-1', actor)).toMatchObject({
        canPublish: true,
        digest: null,
        generatedAt: null,
        revisionId: 'rev-1',
        state: 'unavailable',
      });
      await expect(service.download('brand-1', actor)).rejects.toMatchObject({
        status: kind === 'malformed' ? 422 : 404,
      });
    },
  );
  it('preserves an earlier publication and revocation metadata when the current approval cannot export', async () => {
    await service.publish('brand-1', 'rev-1', actor);
    revisions[0].status = 'SUPERSEDED';
    const invalid = approved('rev-2', 2);
    invalid.content.fields.label.currentValue = '';
    revisions.unshift(invalid);
    expect(await service.state('brand-1', actor)).toMatchObject({
      digest: null,
      generatedAt: null,
      publishedRevisionId: 'rev-1',
      publicUrl: 'https://api.example.com/v1/public/brand-os/pub-1/design.md',
      revisionId: 'rev-2',
      state: 'unavailable',
    });
    expect((await service.publicArtifact('pub-1')).revisionId).toBe('rev-1');
    expect(await service.revoke('brand-1', actor)).toMatchObject({
      digest: null,
      publicUrl: null,
      publishedRevisionId: 'rev-1',
      revisionId: 'rev-2',
      state: 'unavailable',
    });
    await expect(service.publicArtifact('pub-1')).rejects.toMatchObject({
      status: 404,
    });
  });
  it('rejects malformed approved content before publication writes', async () => {
    revisions[0].content.fields.label.currentValue = '';
    await expect(
      service.publish('brand-1', 'rev-1', actor),
    ).rejects.toMatchObject({ status: 422 });
    expect(db.brandOsPublication.upsert).not.toHaveBeenCalled();
  });
  it('keeps warm service-boundary projection p95 below 300ms (in-memory persistence)', async () => {
    await service.publish('brand-1', 'rev-1', actor);
    const elapsed: number[] = [];
    for (let count = 0; count < 100; count++) {
      const start = performance.now();
      await service.publicArtifact('pub-1');
      elapsed.push(performance.now() - start);
    }
    elapsed.sort((a, b) => a - b);
    expect(elapsed[94]).toBeLessThan(300);
  });
});
