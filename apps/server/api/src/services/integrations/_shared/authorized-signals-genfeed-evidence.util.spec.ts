import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { TargetExecutionState } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';
import { buildGenfeedPublishEvidence } from './authorized-signals-genfeed-evidence.util';

function createPrisma(rows: unknown[]) {
  const findMany = vi.fn().mockResolvedValue(rows);

  return {
    findMany,
    prisma: { post: { findMany } } as unknown as Pick<PrismaService, 'post'>,
  };
}

describe('buildGenfeedPublishEvidence', () => {
  it('reports empty evidence when no post has a publish outcome', async () => {
    const { prisma } = createPrisma([]);

    const evidence = await buildGenfeedPublishEvidence({
      credentialId: 'credential-1',
      key: 'genfeed-publish-activity',
      limit: 20,
      observedAt: '2026-11-04T10:00:00.000Z',
      organizationId: 'org-1',
      prisma,
    });

    expect(evidence).toEqual({
      fieldAvailability: {
        attemptedAt: 'available',
        outcome: 'available',
        postId: 'available',
      },
      key: 'genfeed-publish-activity',
      observedAt: '2026-11-04T10:00:00.000Z',
      provenance: 'genfeed_observed',
      scope: { granted: [], missing: [], required: [] },
      staleAt: null,
      status: 'empty',
      value: { attempts: [] },
    });
  });

  it('uses the first available timestamp and drops unsupported outcomes', async () => {
    const updatedAt = new Date('2026-11-01T00:00:00.000Z');
    const { prisma } = createPrisma([
      {
        id: 'post-attempted',
        lastAttemptAt: new Date('2026-11-04T09:00:00.000Z'),
        publicationDate: new Date('2026-11-03T00:00:00.000Z'),
        publishedAt: new Date('2026-11-02T00:00:00.000Z'),
        targetExecutionState: TargetExecutionState.FAILED,
        updatedAt,
      },
      {
        id: 'post-published',
        lastAttemptAt: null,
        publicationDate: new Date('2026-11-03T00:00:00.000Z'),
        publishedAt: new Date('2026-11-02T00:00:00.000Z'),
        targetExecutionState: TargetExecutionState.PUBLISHED,
        updatedAt,
      },
      {
        id: 'post-scheduled',
        lastAttemptAt: null,
        publicationDate: new Date('2026-11-03T00:00:00.000Z'),
        publishedAt: null,
        targetExecutionState: TargetExecutionState.SCHEDULED,
        updatedAt,
      },
      {
        id: 'post-unscheduled',
        lastAttemptAt: null,
        publicationDate: null,
        publishedAt: null,
        targetExecutionState: TargetExecutionState.SKIPPED,
        updatedAt,
      },
      {
        id: 'post-unknown',
        lastAttemptAt: null,
        publicationDate: null,
        publishedAt: null,
        targetExecutionState: 'something-else',
        updatedAt,
      },
    ]);

    const evidence = await buildGenfeedPublishEvidence({
      credentialId: 'credential-1',
      key: 'genfeed-publish-outcomes-observed',
      limit: 20,
      observedAt: '2026-11-04T10:00:00.000Z',
      organizationId: 'org-1',
      prisma,
    });

    expect(evidence.key).toBe('genfeed-publish-outcomes-observed');
    expect(evidence.status).toBe('available');
    expect(evidence.value.attempts).toEqual([
      {
        attemptedAt: '2026-11-04T09:00:00.000Z',
        outcome: 'failed',
        postId: 'post-attempted',
      },
      {
        attemptedAt: '2026-11-02T00:00:00.000Z',
        outcome: 'published',
        postId: 'post-published',
      },
      {
        attemptedAt: '2026-11-03T00:00:00.000Z',
        outcome: 'scheduled',
        postId: 'post-scheduled',
      },
      {
        attemptedAt: '2026-11-01T00:00:00.000Z',
        outcome: 'skipped',
        postId: 'post-unscheduled',
      },
    ]);
  });

  it('scopes the query to the organization and credential within the limit', async () => {
    const { findMany, prisma } = createPrisma([]);

    await buildGenfeedPublishEvidence({
      credentialId: 'credential-1',
      key: 'genfeed-publish-activity',
      limit: 7,
      observedAt: '2026-11-04T10:00:00.000Z',
      organizationId: 'org-1',
      prisma,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 7,
        where: expect.objectContaining({
          credentialId: 'credential-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
  });
});
