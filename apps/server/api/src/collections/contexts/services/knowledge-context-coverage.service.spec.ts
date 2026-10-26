import {
  CONTEXT_COVERAGE_CREDENTIAL_LIMIT,
  CONTEXT_COVERAGE_SOURCE_LIMIT,
  KnowledgeContextCoverageService,
} from '@api/collections/contexts/services/knowledge-context-coverage.service';
import {
  KnowledgeProcessingState,
  KnowledgeRetentionState,
  KnowledgeRetrievalState,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const actor = { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' };
const now = new Date('2026-10-26T12:00:00.000Z');

function readySource(id: string) {
  return {
    id,
    lastSuccessfulSyncAt: new Date('2026-10-20T00:00:00.000Z'),
    staleAt: null,
    syncState: null,
    title: `Source ${id}`,
    versions: [
      {
        expiresAt: null,
        processingState: KnowledgeProcessingState.READY,
        retentionState: KnowledgeRetentionState.RETAINED,
        retrievalState: KnowledgeRetrievalState.ACTIVE,
      },
    ],
  };
}

function build() {
  const prisma = {
    credential: { findMany: vi.fn().mockResolvedValue([]) },
    knowledgeSource: {
      findMany: vi.fn().mockResolvedValue([readySource('a')]),
    },
  };
  const brandAccess = {
    assert: vi.fn().mockResolvedValue(undefined),
    resolve: vi.fn().mockResolvedValue(undefined),
  };
  const ownership = {
    OR: [{ brandId: null, scope: 'org' }],
    isDeleted: false,
    organizationId: 'org-1',
  };
  const records = { ownership: vi.fn().mockResolvedValue(ownership) };
  const logger = { warn: vi.fn() };
  const service = new KnowledgeContextCoverageService(
    prisma as never,
    brandAccess as never,
    records as never,
    logger as never,
  );
  return { brandAccess, logger, ownership, prisma, records, service };
}

describe('KnowledgeContextCoverageService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports every purpose and the brand connections for a search', async () => {
    const { prisma, service } = build();
    prisma.credential.findMany.mockResolvedValue([
      { isConnected: true, platform: 'TWITTER', refreshTokenExpiry: null },
    ]);

    const coverage = await service.forActor(actor, { usage: 'search' }, now);

    expect(prisma.knowledgeSource.findMany).toHaveBeenCalledTimes(3);
    expect(
      coverage.families.map((family) => [family.family, family.purpose]),
    ).toEqual([
      ['knowledge', KnowledgeSourcePurpose.BRAND_TRUTH],
      ['knowledge', KnowledgeSourcePurpose.INSPIRATION],
      ['knowledge', KnowledgeSourcePurpose.RESEARCH],
      ['social_connections', undefined],
    ]);
    expect(coverage.isIncomplete).toBe(false);
    expect(coverage.usage).toBe('search');
    expect(coverage.families[0]?.lastSuccessAt).toBe(
      '2026-10-20T00:00:00.000Z',
    );
  });

  it('limits context usage to brand truth and omits social connections', async () => {
    const { prisma, service } = build();

    const coverage = await service.forActor(actor, { usage: 'context' }, now);

    expect(prisma.knowledgeSource.findMany).toHaveBeenCalledTimes(1);
    expect(
      prisma.knowledgeSource.findMany.mock.calls[0]?.[0].where,
    ).toMatchObject({
      isVisible: true,
      purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
    });
    expect(prisma.credential.findMany).not.toHaveBeenCalled();
    expect(coverage.families).toHaveLength(1);
  });

  it('narrows to the requested purposes', async () => {
    const { prisma, service } = build();

    await service.forActor(
      actor,
      { purposes: [KnowledgeSourcePurpose.RESEARCH], usage: 'search' },
      now,
    );

    expect(prisma.knowledgeSource.findMany).toHaveBeenCalledTimes(1);
    expect(
      prisma.knowledgeSource.findMany.mock.calls[0]?.[0].where,
    ).toMatchObject({ purpose: KnowledgeSourcePurpose.RESEARCH });
  });

  it('omits social connections when there is no brand', async () => {
    const { brandAccess, prisma, service } = build();

    const coverage = await service.forActor(
      { organizationId: 'org-1', userId: 'user-1' },
      { usage: 'search' },
      now,
    );

    expect(prisma.credential.findMany).not.toHaveBeenCalled();
    expect(brandAccess.assert).not.toHaveBeenCalled();
    expect(
      coverage.families.every((family) => family.family === 'knowledge'),
    ).toBe(true);
  });

  it('lets authorization failures propagate instead of reporting empty', async () => {
    const { brandAccess, prisma, service } = build();
    brandAccess.assert.mockRejectedValue(new ForbiddenException());

    await expect(
      service.forActor(actor, { usage: 'search' }, now),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.knowledgeSource.findMany).not.toHaveBeenCalled();
  });

  it('reports a failed read as failed, never empty, and logs without leaking detail', async () => {
    const { logger, prisma, service } = build();
    prisma.knowledgeSource.findMany.mockRejectedValueOnce(new Error('db down'));
    prisma.credential.findMany.mockRejectedValue(new Error('db down'));

    const coverage = await service.forActor(actor, { usage: 'search' }, now);

    expect(coverage.families[0]).toMatchObject({
      family: 'knowledge',
      state: 'failed',
    });
    expect(coverage.families[3]).toMatchObject({
      family: 'social_connections',
      state: 'failed',
    });
    expect(coverage.isIncomplete).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('treats a source list longer than the limit as partial', async () => {
    const { prisma, service } = build();
    prisma.knowledgeSource.findMany.mockResolvedValue(
      Array.from({ length: CONTEXT_COVERAGE_SOURCE_LIMIT + 1 }, (_, index) =>
        readySource(`s${index}`),
      ),
    );

    const coverage = await service.forActor(actor, { usage: 'context' }, now);

    expect(coverage.families[0]?.state).toBe('partial');
  });

  it('reads only connection facts, scoped to the organization and brand', async () => {
    const { prisma, service } = build();
    prisma.credential.findMany.mockResolvedValue([
      { isConnected: false, platform: 'TWITTER', refreshTokenExpiry: null },
      {
        isConnected: true,
        platform: 'UNKNOWN_PLATFORM',
        refreshTokenExpiry: null,
      },
    ]);

    const coverage = await service.forActor(actor, { usage: 'search' }, now);

    const query = prisma.credential.findMany.mock.calls[0]?.[0];
    expect(query.select).toEqual({
      isConnected: true,
      platform: true,
      refreshTokenExpiry: true,
    });
    expect(query.take).toBe(CONTEXT_COVERAGE_CREDENTIAL_LIMIT + 1);
    expect(query.where).toMatchObject({
      brandId: 'brand-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
    const social = coverage.families.find(
      (family) => family.family === 'social_connections',
    );
    expect(social?.state).toBe('disconnected');
    expect(social?.recoveries).toEqual([
      expect.objectContaining({ kind: 'reconnect', platform: 'twitter' }),
    ]);
    expect(JSON.stringify(coverage)).not.toContain('refreshToken');
  });
});
