import { PublishPipelineService } from '@api/endpoints/admin/publish-pipeline/publish-pipeline.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

const NOW = new Date('2026-11-01T12:00:00.000Z');

function approval(id: string, organizationId: string, createdAt: string) {
  return {
    brandId: 'brand_1',
    createdAt: new Date(createdAt),
    executedAt: null,
    id,
    invalidatedAt: null,
    lastError: null,
    organizationId,
    post: {
      platform: 'x',
      scheduledDate: new Date('2026-11-02T09:00:00.000Z'),
      status: 'scheduled',
    },
    postId: `post_${id}`,
    status: 'approved',
  };
}

function reviewedPost(
  id: string,
  organizationId: string,
  reviewedAt: string,
  scheduledDate: string | null,
  targetExecutionState: string,
) {
  return {
    brandId: 'brand_1',
    id,
    organizationId,
    platform: 'x',
    reviewedAt: new Date(reviewedAt),
    scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
    status: 'draft',
    targetExecutionState,
  };
}

describe('PublishPipelineService', () => {
  const findMany = vi.fn();
  let service: PublishPipelineService;

  beforeEach(async () => {
    findMany.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        PublishPipelineService,
        { provide: PrismaService, useValue: { organization: { findMany } } },
      ],
    }).compile();
    service = module.get(PublishPipelineService);
  });

  it('merges approvals across organizations, newest first, with counts', async () => {
    findMany.mockResolvedValueOnce([
      {
        id: 'org_a',
        publishApprovals: [approval('a1', 'org_a', '2026-10-31T08:00:00.000Z')],
      },
      {
        id: 'org_b',
        publishApprovals: [
          approval('b2', 'org_b', '2026-11-01T09:00:00.000Z'),
          approval('b1', 'org_b', '2026-10-31T22:00:00.000Z'),
        ],
      },
    ]);
    findMany.mockResolvedValueOnce([]);

    const report = await service.getReport(2, NOW);

    expect(report.windowDays).toBe(2);
    expect(report.since).toBe('2026-10-30T12:00:00.000Z');
    expect(report.counts.total).toBe(3);
    expect(report.counts.byPostStatus).toEqual({ scheduled: 3 });
    expect(report.items.map((item) => item.approvalId)).toEqual([
      'b2',
      'b1',
      'a1',
    ]);
  });

  it('counts review-queue approvals that have no publish approval', async () => {
    findMany.mockResolvedValueOnce([]);
    findMany.mockResolvedValueOnce([
      {
        id: 'org_a',
        posts: [
          reviewedPost(
            'p1',
            'org_a',
            '2026-10-31T08:00:00.000Z',
            null,
            'draft',
          ),
          reviewedPost(
            'p2',
            'org_a',
            '2026-10-31T09:00:00.000Z',
            '2026-10-31T10:00:00.000Z',
            'scheduled',
          ),
        ],
      },
      {
        id: 'org_b',
        posts: [
          reviewedPost(
            'p3',
            'org_b',
            '2026-10-31T10:00:00.000Z',
            '2026-10-31T11:00:00.000Z',
            'published',
          ),
          {
            ...reviewedPost(
              'p4',
              'org_b',
              '2026-10-31T11:00:00.000Z',
              null,
              'draft',
            ),
            reviewedAt: null,
          },
        ],
      },
    ]);

    const report = await service.getReport(3, NOW);

    expect(report.reviewQueue.counts).toEqual({
      byExecutionState: { draft: 1, published: 1, scheduled: 1 },
      overdue: 1,
      total: 3,
      withScheduleDate: 2,
      withoutScheduleDate: 1,
    });
    expect(report.reviewQueue.items.map((item) => item.postId)).toEqual([
      'p3',
      'p2',
      'p1',
    ]);
  });

  it('reports an empty window', async () => {
    findMany.mockResolvedValue([]);

    const report = await service.getReport(undefined, NOW);

    expect(report.windowDays).toBe(3);
    expect(report.counts.total).toBe(0);
    expect(report.items).toEqual([]);
    expect(report.reviewQueue.counts.total).toBe(0);
    expect(report.reviewQueue.items).toEqual([]);
  });
});
