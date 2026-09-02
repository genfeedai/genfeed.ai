import type { ServerPrisma } from '@api/server.dependencies';
import {
  CredentialPlatform,
  TargetAnalyticsCollectionState,
} from '@genfeedai/enums';
import type {
  AnalyticsCollectionAttemptRef,
  AnalyticsCollectionFailure,
} from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { PostAnalyticsCollectionStateService } from './post-analytics-collection-state.service';

const REQUESTED_AT = new Date('2026-08-01T00:00:00.000Z');

function makeTarget(
  overrides: Partial<AnalyticsCollectionAttemptRef> = {},
): AnalyticsCollectionAttemptRef {
  return {
    attemptKey: 'attempt-1',
    brandId: 'brand-1',
    id: 'post-1',
    organizationId: 'org-1',
    platform: CredentialPlatform.INSTAGRAM,
    ...overrides,
  };
}

const FAILURE: AnalyticsCollectionFailure = {
  code: 'PROVIDER_ERROR',
  isRetryable: true,
  message: 'provider unavailable',
};

describe('PostAnalyticsCollectionStateService', () => {
  const updateMany = vi.fn();
  const findMany = vi.fn();
  const prisma = { post: { findMany, updateMany } } as unknown as Pick<
    ServerPrisma,
    'post'
  >;
  const service = new PostAnalyticsCollectionStateService(prisma);

  beforeEach(() => {
    vi.clearAllMocks();
    updateMany.mockResolvedValue({ count: 1 });
    findMany.mockResolvedValue([]);
  });

  describe('markPending', () => {
    it('writes one tenant-scoped update per organization/brand/platform group', async () => {
      await service.markPending({
        attemptKey: 'attempt-1',
        requestedAt: REQUESTED_AT,
        targets: [
          makeTarget({ id: 'post-1' }),
          makeTarget({ id: 'post-2' }),
          makeTarget({ brandId: 'brand-2', id: 'post-3' }),
        ],
      });

      expect(updateMany).toHaveBeenCalledTimes(2);
      expect(updateMany).toHaveBeenNthCalledWith(1, {
        data: {
          analyticsCollectionAttemptKey: 'attempt-1',
          analyticsCollectionError: Prisma.DbNull,
          analyticsCollectionRequestedAt: REQUESTED_AT,
          analyticsCollectionState: TargetAnalyticsCollectionState.PENDING,
        },
        where: {
          brandId: 'brand-1',
          groupId: { not: null },
          id: { in: ['post-1', 'post-2'] },
          isDeleted: false,
          organizationId: 'org-1',
          parentId: null,
          platform: CredentialPlatform.INSTAGRAM,
        },
      });
    });

    it('keeps different tenants in separate writes', async () => {
      await service.markPending({
        attemptKey: 'attempt-1',
        requestedAt: REQUESTED_AT,
        targets: [
          makeTarget({ id: 'post-1' }),
          makeTarget({ id: 'post-2', organizationId: 'org-2' }),
        ],
      });

      expect(updateMany).toHaveBeenCalledTimes(2);
      const organizations = updateMany.mock.calls.map((call) =>
        String(call[0].where.organizationId),
      );
      expect(organizations).toEqual(['org-1', 'org-2']);
    });

    it('writes nothing for an empty target list', async () => {
      await service.markPending({
        attemptKey: 'attempt-1',
        requestedAt: REQUESTED_AT,
        targets: [],
      });

      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  describe('markReadyBatch', () => {
    it('clears the attempt key and stamps the collection time', async () => {
      const collectedAt = new Date('2026-08-02T00:00:00.000Z');
      findMany.mockResolvedValue([
        { id: 'post-1', publishedAt: new Date('2026-08-01T12:00:00.000Z') },
      ]);

      await service.markReadyBatch([makeTarget()], collectedAt);

      expect(findMany).toHaveBeenCalledWith({
        select: { id: true, publishedAt: true },
        where: {
          id: { in: ['post-1'] },
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
      expect(updateMany).toHaveBeenCalledWith({
        data: {
          analyticsCollectedAt: collectedAt,
          analyticsCollectionAttemptKey: null,
          analyticsCollectionError: Prisma.DbNull,
          analyticsCollectionState: TargetAnalyticsCollectionState.READY,
          analyticsNextCollectAt: new Date('2026-08-02T01:00:00.000Z'),
        },
        where: expect.objectContaining({
          analyticsCollectionAttemptKey: 'attempt-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      });
    });

    it('guards the write with the attempt key so a stale retry cannot clobber it', async () => {
      await service.markReadyBatch([
        makeTarget({ attemptKey: 'attempt-1', id: 'post-1' }),
        makeTarget({ attemptKey: 'attempt-2', id: 'post-2' }),
      ]);

      expect(updateMany).toHaveBeenCalledTimes(2);
      const attemptKeys = updateMany.mock.calls.map((call) =>
        String(call[0].where.analyticsCollectionAttemptKey),
      );
      expect(attemptKeys).toEqual(['attempt-1', 'attempt-2']);
    });

    it('skips targets that carry no attempt key', async () => {
      await service.markReadyBatch([makeTarget({ attemptKey: '' })]);

      expect(updateMany).not.toHaveBeenCalled();
    });

    it('defaults the collection time to now', async () => {
      await service.markReadyBatch([makeTarget()]);

      const [[args]] = updateMany.mock.calls as [
        [{ data: { analyticsCollectedAt: Date } }],
      ];
      expect(args.data.analyticsCollectedAt).toBeInstanceOf(Date);
    });
  });

  describe('markReady', () => {
    it('delegates to the batch write for a single target', async () => {
      await service.markReady(makeTarget());

      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            analyticsCollectionState: TargetAnalyticsCollectionState.READY,
          }),
        }),
      );
    });
  });

  describe('markFailedTargets', () => {
    it('collapses identically classified targets into one write', async () => {
      await service.markFailedTargets([
        { ...makeTarget({ id: 'post-1' }), failure: FAILURE },
        { ...makeTarget({ id: 'post-2' }), failure: { ...FAILURE } },
      ]);

      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(updateMany).toHaveBeenCalledWith({
        data: {
          analyticsCollectionError: {
            code: 'PROVIDER_ERROR',
            failedAt: expect.any(String),
            isRetryable: true,
            message: 'provider unavailable',
          },
          analyticsCollectionState: TargetAnalyticsCollectionState.FAILED,
          analyticsNextCollectAt: expect.any(Date),
        },
        where: expect.objectContaining({
          analyticsCollectionAttemptKey: 'attempt-1',
          id: { in: ['post-1', 'post-2'] },
          isDeleted: false,
          organizationId: 'org-1',
        }),
      });
    });

    it('splits targets whose classification differs', async () => {
      await service.markFailedTargets([
        { ...makeTarget({ id: 'post-1' }), failure: FAILURE },
        {
          ...makeTarget({ id: 'post-2' }),
          failure: { ...FAILURE, code: 'RATE_LIMITED' },
        },
      ]);

      expect(updateMany).toHaveBeenCalledTimes(2);
    });

    it('does not merge groups when a failure message contains the separator', async () => {
      await service.markFailedTargets([
        {
          ...makeTarget({ id: 'post-1' }),
          failure: { ...FAILURE, message: 'a' },
        },
        {
          ...makeTarget({ id: 'post-2' }),
          failure: { ...FAILURE, message: 'b' },
        },
      ]);

      expect(updateMany).toHaveBeenCalledTimes(2);
    });

    it('skips targets without an attempt key', async () => {
      await service.markFailedTargets([
        { ...makeTarget({ attemptKey: '' }), failure: FAILURE },
      ]);

      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  describe('markFailedBatch and markFailed', () => {
    it('applies one failure classification across the batch', async () => {
      await service.markFailedBatch(
        [makeTarget({ id: 'post-1' }), makeTarget({ id: 'post-2' })],
        FAILURE,
      );

      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['post-1', 'post-2'] } }),
        }),
      );
    });

    it('delegates a single failure to the batch write', async () => {
      await service.markFailed(makeTarget(), FAILURE);

      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            analyticsCollectionState: TargetAnalyticsCollectionState.FAILED,
          }),
        }),
      );
    });
  });
});
