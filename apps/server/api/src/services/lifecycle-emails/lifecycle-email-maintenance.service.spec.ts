import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import type { EmailPerformanceService } from '@api/services/email-performance/email-performance.service';
import type { NotificationPreferenceService } from '@api/services/notifications/workflow-notifications/notification-preference.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ConfigService } from '@libs/config/config.service';
import { describe, expect, it, vi } from 'vitest';
import {
  completedEmailPeriod,
  LifecycleEmailMaintenanceService,
} from './lifecycle-email-maintenance.service';
import type { LifecycleEmailWorkflowService } from './lifecycle-email-workflow.service';
import type { SystemEmailEligibilityService } from './system-email-eligibility.service';

const request = {
  organizationId: 'org-1',
  referenceDate: '2026-09-14T08:00:00.000Z',
};
function fixture(count: number) {
  const queueEmail = vi.fn();
  const findForUser = vi.fn().mockResolvedValue({ isEnabled: true });
  const prisma = {
    brand: { findFirst: vi.fn().mockResolvedValue({ slug: 'brand' }) },
    organization: { findFirst: vi.fn().mockResolvedValue({ slug: 'studio' }) },
    member: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 'member-1', userId: 'user-1' }]),
    },
    ingredient: {
      findMany: vi.fn().mockResolvedValue(
        Array.from({ length: count }, (_, index) => ({
          id: `asset-${index}`,
          brandId: 'brand-1',
        })),
      ),
    },
    article: { findMany: vi.fn().mockResolvedValue([]) },
    post: { findMany: vi.fn().mockResolvedValue([]) },
    creditTransaction: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: -450 } }),
    },
  };
  const service = new LifecycleEmailMaintenanceService(
    prisma as unknown as PrismaService,
    {
      get: vi.fn().mockReturnValue('https://app.genfeed.ai'),
    } as unknown as ConfigService,
    {} as SystemWorkflowRunnerService,
    {} as LifecycleEmailWorkflowService,
    { queueEmail } as unknown as EmailPerformanceService,
    {
      hasConnection: vi.fn().mockResolvedValue(true),
    } as unknown as SystemEmailEligibilityService,
    { findForUser } as unknown as NotificationPreferenceService,
    {} as WorkflowExecutionQueueService,
  );
  return { service, prisma, queueEmail, findForUser };
}

describe('system recap policy', () => {
  it('uses the previous complete Monday to Monday week across year boundaries', () => {
    expect(
      completedEmailPeriod(new Date('2027-01-03T23:59:59Z'), true),
    ).toEqual({
      start: new Date('2026-12-21T00:00:00Z'),
      end: new Date('2026-12-28T00:00:00Z'),
    });
    expect(
      completedEmailPeriod(new Date('2027-01-04T00:00:00Z'), true),
    ).toEqual({
      start: new Date('2026-12-28T00:00:00Z'),
      end: new Date('2027-01-04T00:00:00Z'),
    });
  });
  it('uses the previous complete UTC day', () => {
    expect(
      completedEmailPeriod(new Date('2026-09-09T08:00:00Z'), false),
    ).toEqual({
      start: new Date('2026-09-08T00:00:00Z'),
      end: new Date('2026-09-09T00:00:00Z'),
    });
  });
  it('does not queue a weekly recap for four outputs', async () => {
    const { service, queueEmail } = fixture(4);
    await service.recaps(request);
    expect(queueEmail.mock.calls.map(([input]) => input.topic)).toEqual([
      'content.daily',
    ]);
  });
  it('queues a tracked weekly recap at five outputs using completion time and tenant/user scope', async () => {
    const { service, prisma, queueEmail } = fixture(5);
    await service.recaps(request);
    expect(prisma.ingredient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
          isDeleted: false,
          parentId: null,
          generationCompletedAt: {
            gte: new Date('2026-09-07T00:00:00Z'),
            lt: new Date('2026-09-14T00:00:00Z'),
          },
        }),
      }),
    );
    expect(queueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'content.weekly',
        userId: 'user-1',
        organizationId: 'org-1',
        html: expect.stringContaining('{{emailActionUrl}}'),
        idempotencyKey: 'product:org-1:week:user-1:2026-09-07T00:00:00.000Z',
      }),
    );
    expect(queueEmail.mock.calls[0][0].html).toContain(
      'analytics are available',
    );
  });
  it('deduplicates repeated generated IDs before the five-piece threshold', async () => {
    const { service, prisma, queueEmail } = fixture(5);
    prisma.ingredient.findMany.mockResolvedValue(
      Array.from({ length: 5 }, () => ({
        id: 'same-asset',
        brandId: 'brand-1',
      })),
    );
    await service.recaps(request);
    expect(queueEmail.mock.calls.map(([input]) => input.topic)).toEqual([
      'content.daily',
    ]);
  });
  it('does not prepare or queue recaps when both recap preferences are disabled', async () => {
    const { service, prisma, queueEmail, findForUser } = fixture(5);
    findForUser.mockResolvedValue({ isEnabled: false });
    await service.recaps(request);
    expect(queueEmail).not.toHaveBeenCalled();
    expect(prisma.ingredient.findMany).not.toHaveBeenCalled();
  });
  it('counts generated articles for an article-only creator', async () => {
    const { service, prisma, queueEmail } = fixture(0);
    prisma.article.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        id: `article-${index}`,
        brandId: 'brand-1',
        label: `Article ${index}`,
      })),
    );
    await service.recaps(request);
    expect(queueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'content.weekly',
        html: expect.stringContaining('Article 0'),
      }),
    );
    expect(queueEmail.mock.calls.map(([input]) => input.topic)).toEqual([
      'content.weekly',
    ]);
  });
});
