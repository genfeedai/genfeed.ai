vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ContentDraftsService } from '@api/collections/content-drafts/services/content-drafts.service';
import type { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentDraftStatus } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';

type MockDelegate = {
  findFirst: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

describe('ContentDraftsService.update', () => {
  let service: ContentDraftsService;
  let delegate: MockDelegate;

  const existing = {
    id: 'draft-1',
    isDeleted: false,
    metadata: { source: 'engine' },
    organizationId: 'org-1',
  };

  beforeEach(() => {
    delegate = {
      findFirst: vi.fn().mockResolvedValue(existing),
      update: vi
        .fn()
        .mockImplementation(({ data }) => ({ ...existing, ...data })),
    };

    service = new ContentDraftsService(
      { contentDraft: delegate } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      {
        recordDraftRemixLineage: vi.fn(),
      } as unknown as TrendReferenceCorpusService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('approves the draft and stamps the approver', async () => {
    await service.update(
      'draft-1',
      'org-1',
      {
        status: ContentDraftStatus.APPROVED,
      },
      'user-1',
    );

    expect(delegate.update).toHaveBeenCalledWith({
      data: { approvedBy: 'user-1', status: ContentDraftStatus.APPROVED },
      where: { id: 'draft-1' },
    });
  });

  it('rejects the draft and merges the reason into metadata', async () => {
    await service.update('draft-1', 'org-1', {
      reason: 'off-brand',
      status: ContentDraftStatus.REJECTED,
    });

    expect(delegate.update).toHaveBeenCalledWith({
      data: {
        metadata: { rejectionReason: 'off-brand', source: 'engine' },
        status: ContentDraftStatus.REJECTED,
      },
      where: { id: 'draft-1' },
    });
  });

  it('edits the draft content', async () => {
    await service.update('draft-1', 'org-1', { content: 'new copy' });

    expect(delegate.update).toHaveBeenCalledWith({
      data: { content: 'new copy' },
      where: { id: 'draft-1' },
    });
  });

  it('applies a content edit and an approval in one call', async () => {
    await service.update(
      'draft-1',
      'org-1',
      {
        content: 'edited then approved',
        status: ContentDraftStatus.APPROVED,
      },
      'user-1',
    );

    expect(delegate.update).toHaveBeenCalledWith({
      data: { content: 'edited then approved' },
      where: { id: 'draft-1' },
    });
    expect(delegate.update).toHaveBeenCalledWith({
      data: { approvedBy: 'user-1', status: ContentDraftStatus.APPROVED },
      where: { id: 'draft-1' },
    });
  });

  it('returns the existing draft without writing when nothing changes', async () => {
    const result = await service.update('draft-1', 'org-1', {});

    expect(delegate.update).not.toHaveBeenCalled();
    expect(result).toEqual(existing);
  });
});

/**
 * Regression coverage for the `findOrThrow` adoption (DRY/slop audit §2.J).
 * The org-scoped "fetch or 404" branches in approve/reject/editDraft now route
 * through the shared helper. These assert the tenant scoping the helper is
 * handed, that missing/foreign/soft-deleted rows 404, and that the canonical
 * JSON:API error shape is preserved.
 */
describe('ContentDraftsService — findOrThrow tenant scoping', () => {
  type Row = {
    id: string;
    organizationId: string;
    isDeleted: boolean;
    metadata?: Record<string, unknown>;
  };

  function buildService(rows: Row[]): {
    service: ContentDraftsService;
    delegate: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  } {
    const matches = (where: Record<string, unknown>, row: Row): boolean =>
      (where.id === undefined || where.id === row.id) &&
      (where.organizationId === undefined ||
        where.organizationId === row.organizationId) &&
      (where.isDeleted === undefined || where.isDeleted === row.isDeleted);

    const delegate = {
      findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(rows.find((row) => matches(where, row)) ?? null),
      ),
      update: vi.fn(
        ({ where, data }: { where: { id: string }; data: unknown }) =>
          Promise.resolve({
            ...rows.find((row) => row.id === where.id),
            ...(data as Record<string, unknown>),
          }),
      ),
    };

    const service = new ContentDraftsService(
      { contentDraft: delegate } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      {
        recordDraftRemixLineage: vi.fn(),
      } as unknown as TrendReferenceCorpusService,
    );

    return { delegate, service };
  }

  it('approve: authorized access resolves and writes the approval', async () => {
    const { service, delegate } = buildService([
      { id: 'draft-1', isDeleted: false, organizationId: 'org-1' },
    ]);

    await service.approve('draft-1', 'org-1', 'user-1');

    expect(delegate.findFirst).toHaveBeenCalledWith({
      where: { id: 'draft-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(delegate.update).toHaveBeenCalledWith({
      data: { approvedBy: 'user-1', status: ContentDraftStatus.APPROVED },
      where: { id: 'draft-1' },
    });
  });

  it('approve: wrong-organization access 404s and never writes', async () => {
    const { service, delegate } = buildService([
      { id: 'draft-1', isDeleted: false, organizationId: 'org-1' },
    ]);

    await expect(service.approve('draft-1', 'org-2', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(delegate.update).not.toHaveBeenCalled();
  });

  it('approve: soft-deleted rows 404 (isDeleted:false filter is enforced)', async () => {
    const { service, delegate } = buildService([
      { id: 'draft-1', isDeleted: true, organizationId: 'org-1' },
    ]);

    await expect(service.approve('draft-1', 'org-1', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(delegate.update).not.toHaveBeenCalled();
  });

  it('approve: preserves the canonical JSON:API 404 shape', async () => {
    const { service } = buildService([]);

    try {
      await service.approve('missing-draft', 'org-1', 'user-1');
      throw new Error('expected NotFoundException');
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundException);
      const exception = error as NotFoundException;
      expect(exception.getStatus()).toBe(404);
      expect(exception.getResponse()).toEqual({
        detail: "ContentDraft with identifier 'missing-draft' not found",
        source: { parameter: 'missing-draft' },
        title: 'Resource Not Found',
      });
    }
  });

  it('reject: authorized access uses the fetched row to merge the reason', async () => {
    const { service, delegate } = buildService([
      {
        id: 'draft-1',
        isDeleted: false,
        metadata: { source: 'engine' },
        organizationId: 'org-1',
      },
    ]);

    await service.reject('draft-1', 'org-1', 'off-brand');

    expect(delegate.update).toHaveBeenCalledWith({
      data: {
        metadata: { rejectionReason: 'off-brand', source: 'engine' },
        status: ContentDraftStatus.REJECTED,
      },
      where: { id: 'draft-1' },
    });
  });

  it('reject: wrong-organization access 404s and never writes', async () => {
    const { service, delegate } = buildService([
      { id: 'draft-1', isDeleted: false, organizationId: 'org-1' },
    ]);

    await expect(service.reject('draft-1', 'org-2')).rejects.toThrow(
      NotFoundException,
    );
    expect(delegate.update).not.toHaveBeenCalled();
  });

  it('editDraft: wrong-organization access 404s and never writes', async () => {
    const { service, delegate } = buildService([
      { id: 'draft-1', isDeleted: false, organizationId: 'org-1' },
    ]);

    await expect(
      service.editDraft('draft-1', 'org-2', 'new copy'),
    ).rejects.toThrow(NotFoundException);
    expect(delegate.update).not.toHaveBeenCalled();
  });
});
