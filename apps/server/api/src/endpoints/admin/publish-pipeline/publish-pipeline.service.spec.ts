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
    findMany.mockResolvedValue([
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

  it('reports an empty window', async () => {
    findMany.mockResolvedValue([]);

    const report = await service.getReport(undefined, NOW);

    expect(report.windowDays).toBe(3);
    expect(report.counts.total).toBe(0);
    expect(report.items).toEqual([]);
  });
});
