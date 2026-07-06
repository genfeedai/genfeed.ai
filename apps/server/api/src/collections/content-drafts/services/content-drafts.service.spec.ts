vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ContentDraftsService } from '@api/collections/content-drafts/services/content-drafts.service';
import type { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
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
