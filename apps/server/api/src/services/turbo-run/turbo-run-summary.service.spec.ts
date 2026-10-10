import { TurboRunSummaryService } from '@api/services/turbo-run/turbo-run-summary.service';
import {
  ContentFormat,
  ReviewDecision,
  TurboRunItemStatus,
  TurboRunStatus,
} from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('TurboRunSummaryService assignee projection', () => {
  const prisma = {
    member: { findMany: vi.fn() },
    post: { findMany: vi.fn() },
    postAnalytics: { findMany: vi.fn() },
  };
  const publishApprovalsService = {
    toPublicInterface: vi.fn(),
  };

  let service: TurboRunSummaryService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.post.findMany.mockResolvedValue([]);
    prisma.postAnalytics.findMany.mockResolvedValue([]);
    prisma.member.findMany.mockResolvedValue([]);
    service = new TurboRunSummaryService(
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

    const summary = await service.toTurboRunSummary({
      brandId: 'brand-1',
      config: {},
      createdAt: new Date('2026-08-19T10:00:00.000Z'),
      id: 'run-1',
      items: [
        {
          assigneeId: 'user-1',
          format: ContentFormat.IMAGE,
          id: 'item-1',
          reviewDecision: ReviewDecision.UNSET,
          status: TurboRunItemStatus.COMPLETED,
        },
      ],
      organizationId: 'org-1',
      status: TurboRunStatus.COMPLETED,
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

    const summary = await service.toTurboRunSummary({
      brandId: 'brand-1',
      config: {},
      createdAt: new Date('2026-08-19T10:00:00.000Z'),
      id: 'run-1',
      items: [
        {
          assigneeId: 'user-deleted',
          format: ContentFormat.IMAGE,
          id: 'item-1',
          reviewDecision: ReviewDecision.APPROVED,
          status: TurboRunItemStatus.COMPLETED,
        },
      ],
      organizationId: 'org-1',
      status: TurboRunStatus.COMPLETED,
    } as never);

    expect(summary.items[0]?.assignee).toBeUndefined();
    expect(summary.items[0]?.assigneeId).toBe('user-deleted');
    expect(summary.items[0]?.reviewDecision).toBe(ReviewDecision.APPROVED);
  });

  it('preserves content-run and variant lineage in returned Turbo run items', async () => {
    const summary = await service.toTurboRunSummary({
      brandId: 'brand-1',
      config: {},
      createdAt: new Date('2026-08-19T10:00:00.000Z'),
      id: 'run-1',
      items: [
        {
          contentRunId: 'run-1',
          format: ContentFormat.VIDEO,
          id: 'item-1',
          reviewDecision: ReviewDecision.UNSET,
          status: TurboRunItemStatus.COMPLETED,
          variantId: 'variant-1',
        },
      ],
      organizationId: 'org-1',
      status: TurboRunStatus.COMPLETED,
    } as never);

    expect(summary.items[0]).toMatchObject({
      contentRunId: 'run-1',
      variantId: 'variant-1',
    });
  });
});
