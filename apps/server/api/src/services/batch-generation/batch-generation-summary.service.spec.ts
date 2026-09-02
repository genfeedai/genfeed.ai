import { BatchGenerationSummaryService } from '@api/services/batch-generation/batch-generation-summary.service';
import {
  BatchItemStatus,
  BatchStatus,
  ContentFormat,
  ReviewDecision,
} from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('BatchGenerationSummaryService assignee projection', () => {
  const prisma = {
    member: { findMany: vi.fn() },
    post: { findMany: vi.fn() },
    postAnalytics: { findMany: vi.fn() },
  };
  const publishApprovalsService = {
    toPublicInterface: vi.fn(),
  };

  let service: BatchGenerationSummaryService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.post.findMany.mockResolvedValue([]);
    prisma.postAnalytics.findMany.mockResolvedValue([]);
    prisma.member.findMany.mockResolvedValue([]);
    service = new BatchGenerationSummaryService(
      prisma as never,
      publishApprovalsService as never,
    );
  });

  it('exposes only bounded assignee identity for org members', async () => {
    prisma.member.findMany.mockResolvedValue([
      {
        organizationId: 'org-1',
        user: {
          avatar: 'https://cdn.example.com/jane.png',
          email: 'secret@example.com',
          firstName: 'Jane',
          handle: 'jane',
          id: 'user-1',
          isDeleted: false,
          lastName: 'Doe',
          name: 'Jane Doe',
        },
      },
    ]);

    const summary = await service.toBatchSummary({
      brandId: 'brand-1',
      config: {},
      createdAt: new Date('2026-08-19T10:00:00.000Z'),
      id: 'batch-1',
      items: [
        {
          assigneeId: 'user-1',
          format: ContentFormat.IMAGE,
          id: 'item-1',
          reviewDecision: ReviewDecision.UNSET,
          status: BatchItemStatus.COMPLETED,
        },
      ],
      organizationId: 'org-1',
      status: BatchStatus.COMPLETED,
    } as never);

    expect(prisma.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          isDeleted: false,
          organizationId: { in: ['org-1'] },
          userId: { in: ['user-1'] },
        }),
      }),
    );
    expect(summary.items[0]?.assigneeId).toBe('user-1');
    expect(summary.items[0]?.assignee).toEqual({
      displayName: 'Jane Doe',
      handle: 'jane',
      id: 'user-1',
    });
    expect(JSON.stringify(summary.items[0]?.assignee)).not.toContain('secret');
    expect(JSON.stringify(summary.items[0]?.assignee)).not.toContain('email');
  });

  it('omits assignee identity when membership is missing or the user is deleted', async () => {
    prisma.member.findMany.mockResolvedValue([]);

    const summary = await service.toBatchSummary({
      brandId: 'brand-1',
      config: {},
      createdAt: new Date('2026-08-19T10:00:00.000Z'),
      id: 'batch-1',
      items: [
        {
          assigneeId: 'user-deleted',
          format: ContentFormat.IMAGE,
          id: 'item-1',
          reviewDecision: ReviewDecision.APPROVED,
          status: BatchItemStatus.COMPLETED,
        },
      ],
      organizationId: 'org-1',
      status: BatchStatus.COMPLETED,
    } as never);

    expect(summary.items[0]?.assignee).toBeUndefined();
    expect(summary.items[0]?.assigneeId).toBe('user-deleted');
    expect(summary.items[0]?.reviewDecision).toBe(ReviewDecision.APPROVED);
  });

  it('preserves content-run and variant lineage in returned batch items', async () => {
    const summary = await service.toBatchSummary({
      brandId: 'brand-1',
      config: {},
      createdAt: new Date('2026-08-19T10:00:00.000Z'),
      id: 'batch-1',
      items: [
        {
          contentRunId: 'run-1',
          format: ContentFormat.VIDEO,
          id: 'item-1',
          reviewDecision: ReviewDecision.UNSET,
          status: BatchItemStatus.COMPLETED,
          variantId: 'variant-1',
        },
      ],
      organizationId: 'org-1',
      status: BatchStatus.COMPLETED,
    } as never);

    expect(summary.items[0]).toMatchObject({
      contentRunId: 'run-1',
      variantId: 'variant-1',
    });
  });
});
