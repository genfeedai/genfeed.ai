vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ListeningTopicAnalysisService } from '@api/collections/listening-topics/services/listening-topic-analysis.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

const context = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

const windows = {
  currentWindowEnd: '2026-08-26T12:00:00.000Z',
  currentWindowStart: '2026-08-25T12:00:00.000Z',
  minimumEvidencePerWindow: 1,
  previousWindowEnd: '2026-08-25T12:00:00.000Z',
  previousWindowStart: '2026-08-24T12:00:00.000Z',
};

function evidence(
  id: string,
  occurredAt: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    brandId: 'brand-1',
    collectedAt: new Date(occurredAt),
    contentExcerpt: 'AI agents are changing publishing',
    freshnessExpiresAt: new Date('2026-08-27T12:00:00.000Z'),
    id,
    isDeleted: false,
    metrics: { sentiment: 0.5 },
    occurredAt: new Date(occurredAt),
    organizationId: 'org-1',
    topicId: 'topic-1',
    topicSource: { sourceId: 'source-1' },
    ...overrides,
  };
}

describe('ListeningTopicAnalysisService', () => {
  const listeningTopic = {
    findFirst: vi.fn(),
  };
  const listeningEvidence = {
    findMany: vi.fn(),
  };
  const listeningTheme = {
    count: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  };
  const listeningThemeEvidence = {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  };
  const listeningSignal = {
    count: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  };
  const transaction = {
    listeningSignal,
    listeningTheme,
    listeningThemeEvidence,
  };
  const prisma = {
    $transaction: vi.fn(async (callback) => callback(transaction)),
    listeningEvidence,
    listeningSignal,
    listeningTheme,
    listeningTopic,
  };

  let service: ListeningTopicAnalysisService;

  beforeEach(() => {
    vi.clearAllMocks();
    listeningTopic.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      id: 'topic-1',
      keywords: ['ai agents'],
      organizationId: 'org-1',
      sources: [{ sourceId: 'source-1' }, { sourceId: 'source-2' }],
    });
    listeningTheme.updateMany.mockResolvedValue({ count: 0 });
    listeningSignal.updateMany.mockResolvedValue({ count: 0 });
    listeningTheme.count.mockResolvedValue(0);
    listeningSignal.count.mockResolvedValue(0);
    listeningThemeEvidence.deleteMany.mockResolvedValue({ count: 0 });
    listeningThemeEvidence.createMany.mockResolvedValue({ count: 2 });
    listeningTheme.upsert.mockImplementation(async ({ create }) => ({
      ...create,
      id: 'theme-1',
    }));
    listeningSignal.upsert.mockImplementation(async ({ create }) => ({
      ...create,
      id: `signal-${create.signalType}`,
    }));
    service = new ListeningTopicAnalysisService(
      prisma as unknown as PrismaService,
    );
  });

  it('clusters only fresh evidence in the requested tenant, brand, topic, and windows', async () => {
    listeningEvidence.findMany.mockResolvedValue([
      evidence('previous-1', '2026-08-24T18:00:00.000Z'),
      evidence('current-1', '2026-08-25T18:00:00.000Z'),
      evidence('foreign-tenant', '2026-08-25T19:00:00.000Z', {
        organizationId: 'org-2',
      }),
    ]);

    const result = await service.analyzeScoped('topic-1', windows, context);

    expect(listeningEvidence.findMany).toHaveBeenCalledWith({
      include: { topicSource: { select: { sourceId: true } } },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      where: {
        OR: [
          {
            occurredAt: {
              gte: new Date(windows.previousWindowStart),
              lt: new Date(windows.previousWindowEnd),
            },
          },
          {
            occurredAt: {
              gte: new Date(windows.currentWindowStart),
              lt: new Date(windows.currentWindowEnd),
            },
          },
        ],
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
        topicId: 'topic-1',
        topicSource: { isDeleted: false },
      },
    });
    expect(result.status).toBe('sufficient');
    expect(result.themes).toHaveLength(1);
    expect(result.themes[0]?.evidenceIds).toEqual(['current-1', 'previous-1']);
    expect(
      result.signals.flatMap((signal) => signal.evidenceIds),
    ).not.toContain('foreign-tenant');
    expect(result.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          excludedSourceIds: ['source-2'],
          includedSourceIds: ['source-1'],
          signalType: 'volume',
          status: 'sufficient',
          value: 1,
        }),
        expect.objectContaining({
          signalType: 'sentiment_direction',
          status: 'sufficient',
          value: 0.5,
        }),
      ]),
    );
  });

  it('persists explicit insufficiency and null values when evidence is stale', async () => {
    listeningEvidence.findMany.mockResolvedValue([
      evidence('stale-1', '2026-08-25T18:00:00.000Z', {
        freshnessExpiresAt: new Date('2026-08-26T10:00:00.000Z'),
      }),
    ]);

    const result = await service.analyzeScoped('topic-1', windows, context);

    expect(result).toMatchObject({
      reason: 'stale_evidence',
      status: 'insufficient_evidence',
    });
    expect(result.signals).toHaveLength(4);
    expect(result.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          confidence: 0,
          evidenceIds: [],
          excludedSourceIds: ['source-1', 'source-2'],
          includedSourceIds: [],
          status: 'insufficient_evidence',
          value: null,
        }),
      ]),
    );
  });

  it('distinguishes missing evidence without inventing a numeric conclusion', async () => {
    listeningEvidence.findMany.mockResolvedValue([]);

    const result = await service.analyzeScoped('topic-1', windows, context);

    expect(result).toMatchObject({
      reason: 'missing_evidence',
      status: 'insufficient_evidence',
    });
    expect(result.signals.every(({ value }) => value === null)).toBe(true);
  });

  it('marks fresh but underpowered windows insufficient', async () => {
    listeningEvidence.findMany.mockResolvedValue([
      evidence('previous-1', '2026-08-24T18:00:00.000Z'),
      evidence('current-1', '2026-08-25T18:00:00.000Z'),
    ]);

    const result = await service.analyzeScoped(
      'topic-1',
      { ...windows, minimumEvidencePerWindow: 2 },
      context,
    );

    expect(result).toMatchObject({
      reason: 'underpowered_evidence',
      status: 'insufficient_evidence',
    });
    expect(result.signals.every(({ value }) => value === null)).toBe(true);
  });

  it('rejects unbounded or unequal comparison windows', async () => {
    await expect(
      service.analyzeScoped(
        'topic-1',
        {
          ...windows,
          previousWindowStart: '2026-06-01T12:00:00.000Z',
        },
        context,
      ),
    ).rejects.toThrow('Listening analysis windows cannot exceed 31 days');

    await expect(
      service.analyzeScoped(
        'topic-1',
        {
          ...windows,
          previousWindowStart: '2026-08-24T18:00:00.000Z',
        },
        context,
      ),
    ).rejects.toThrow(
      'Listening analysis comparison windows must have equal duration',
    );
    expect(listeningTopic.findFirst).not.toHaveBeenCalled();
  });

  it('uses stable idempotency identities when recomputing the same windows', async () => {
    listeningEvidence.findMany.mockResolvedValue([
      evidence('previous-1', '2026-08-24T18:00:00.000Z'),
      evidence('current-1', '2026-08-25T18:00:00.000Z'),
    ]);

    await service.analyzeScoped('topic-1', windows, context);
    const firstThemeWhere = listeningTheme.upsert.mock.calls[0][0].where;
    const firstSignalWheres = listeningSignal.upsert.mock.calls.map(
      ([argument]) => argument.where,
    );

    vi.clearAllMocks();
    listeningTopic.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      id: 'topic-1',
      keywords: ['ai agents'],
      organizationId: 'org-1',
      sources: [{ sourceId: 'source-1' }, { sourceId: 'source-2' }],
    });
    listeningEvidence.findMany.mockResolvedValue([
      evidence('previous-1', '2026-08-24T18:00:00.000Z'),
      evidence('current-1', '2026-08-25T18:00:00.000Z'),
    ]);
    listeningTheme.upsert.mockImplementation(async ({ create }) => ({
      ...create,
      id: 'theme-1',
    }));
    listeningSignal.upsert.mockImplementation(async ({ create }) => ({
      ...create,
      id: `signal-${create.signalType}`,
    }));
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await service.analyzeScoped('topic-1', windows, context);

    expect(listeningTheme.upsert.mock.calls[0][0].where).toEqual(
      firstThemeWhere,
    );
    expect(
      listeningSignal.upsert.mock.calls.map(([argument]) => argument.where),
    ).toEqual(firstSignalWheres);
  });

  it('lists themes and signals with tenant, brand, topic, and soft-delete scope', async () => {
    listeningTheme.findMany.mockResolvedValue([]);
    listeningSignal.findMany.mockResolvedValue([]);

    const query = { isDeleted: false, limit: 25, page: 1 } as never;
    await service.listThemesScoped('topic-1', context, query);
    await service.listSignalsScoped('topic-1', context, query);

    const scopedWhere = {
      brandId: 'brand-1',
      isDeleted: false,
      organizationId: 'org-1',
      topicId: 'topic-1',
    };
    expect(listeningTheme.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: scopedWhere }),
    );
    expect(listeningSignal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: scopedWhere }),
    );
    expect(listeningTheme.count).toHaveBeenCalledWith({ where: scopedWhere });
    expect(listeningSignal.count).toHaveBeenCalledWith({ where: scopedWhere });
  });

  it('persists a scoped review while preserving the complete evidence set', async () => {
    const reviewedAt = new Date('2026-08-26T14:00:00.000Z');
    listeningTheme.updateMany.mockResolvedValueOnce({ count: 1 });
    listeningTheme.findFirst.mockResolvedValueOnce({
      brandId: 'brand-1',
      evidence: [{ evidenceId: 'evidence-2' }, { evidenceId: 'evidence-1' }],
      id: 'theme-1',
      organizationId: 'org-1',
      reviewState: 'acknowledged',
      reviewedAt,
      reviewedBy: 'legacyBase62UserId',
      topicId: 'topic-1',
    });

    const result = await service.reviewThemeScoped(
      'topic-1',
      'theme-1',
      { state: 'acknowledged' },
      { ...context, userId: 'legacyBase62UserId' },
      reviewedAt,
    );

    const scope = {
      brandId: 'brand-1',
      id: 'theme-1',
      isDeleted: false,
      organizationId: 'org-1',
      topicId: 'topic-1',
    };
    expect(listeningTheme.updateMany).toHaveBeenCalledWith({
      data: {
        reviewState: 'acknowledged',
        reviewedAt,
        reviewedBy: 'legacyBase62UserId',
      },
      where: scope,
    });
    expect(listeningTheme.findFirst).toHaveBeenCalledWith({
      include: {
        evidence: {
          orderBy: { evidenceId: 'asc' },
          select: { evidenceId: true },
        },
      },
      where: scope,
    });
    expect(result.evidenceIds).toEqual(['evidence-1', 'evidence-2']);
    expect(listeningThemeEvidence.deleteMany).not.toHaveBeenCalled();
    expect(listeningThemeEvidence.createMany).not.toHaveBeenCalled();
  });

  it('does not review a theme outside the authenticated tenant and brand', async () => {
    listeningTheme.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.reviewThemeScoped(
        'topic-1',
        'foreign-theme',
        { state: 'deferred' },
        context,
      ),
    ).rejects.toThrow('Listening theme not found');

    expect(listeningTheme.findFirst).not.toHaveBeenCalled();
  });
});
