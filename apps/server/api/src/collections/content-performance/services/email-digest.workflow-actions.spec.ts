import type { ServerLogger, ServerPrisma } from '@api/server.dependencies';
import type { EmailPerformanceService } from '@api/services/email-performance/email-performance.service';
import type { ConfigService } from '@libs/config/config.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailDigestService } from './email-digest.service';
import type {
  PerformanceSummaryService,
  WeeklySummary,
} from './performance-summary.service';

const summary: WeeklySummary = {
  avgEngagementByContentType: [],
  avgEngagementByPlatform: [],
  bestPostingTimes: [],
  dataset: {
    confidence: 'none',
    genfeedPosts: 0,
    importedPosts: 0,
    totalPosts: 0,
  },
  topHooks: [],
  topPerformers: [],
  weekOverWeekTrend: {
    currentEngagement: 10,
    direction: 'up',
    percentageChange: 100,
    previousEngagement: 5,
  },
  worstPerformers: [],
};

describe('EmailDigestService workflow actions', () => {
  let service: EmailDigestService;
  let queueEmail: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queueEmail = vi.fn().mockResolvedValue('delivery-1');
    service = new EmailDigestService(
      {
        getWeeklySummary: vi.fn().mockResolvedValue(summary),
      } as unknown as PerformanceSummaryService,
      { queueEmail } as unknown as EmailPerformanceService,
      {
        organization: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'org-1',
            slug: 'acme',
            label: 'Acme',
            userId: 'user-1',
          }),
        },
        brand: { findFirst: vi.fn().mockResolvedValue({ slug: 'studio' }) },
        member: { findFirst: vi.fn().mockResolvedValue({ userId: 'user-1' }) },
      } as unknown as ServerPrisma,
      {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as ServerLogger,
      {
        get: vi.fn(() => 'https://app.genfeed.ai'),
      } as unknown as ConfigService,
    );
  });

  it('prepares, discovers, and renders one immutable delivery item', async () => {
    const options = Object.freeze({
      brandId: 'brand-1',
      organizationId: 'org-1',
      startDate: '2026-08-01',
      endDate: '2026-08-07',
    });
    const prepared = await service.prepareDigest(options);
    Object.freeze(prepared.options);
    Object.freeze(prepared);
    const discovered = await service.discoverDigestRecipients(prepared);
    Object.freeze(discovered.recipientUserIds);
    Object.freeze(discovered);
    const before = structuredClone(discovered);
    const rendered = service.renderDigest(discovered);
    expect(discovered).toEqual(before);
    expect(options.startDate).toBe('2026-08-01');

    expect(rendered.deliveries).toEqual([
      expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-1',
        brandId: 'brand-1',
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-07T23:59:59.999Z',
        destinationUrl: 'https://app.genfeed.ai/acme/studio/library/assets',
        subject: 'Weekly Performance Digest - Acme',
      }),
    ]);
    expect(rendered.deliveries[0]?.html).toContain('Weekly Performance Digest');
    expect(rendered.deliveries[0]?.html).toContain('href="{{emailActionUrl}}"');
    expect(rendered.deliveries[0]).not.toHaveProperty('email');
  });

  it('returns a failed recipient result without failing sibling fanout items', async () => {
    queueEmail.mockRejectedValueOnce(new Error('outbox unavailable'));
    const delivery = Object.freeze({
      userId: 'user-1',
      organizationId: 'org-1',
      brandId: 'brand-1',
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-07T23:59:59.999Z',
      destinationUrl: 'https://app.genfeed.ai/acme/studio/library/assets',
      html: '<p>Digest</p>',
      subject: 'Digest',
    });
    const sibling = Object.freeze({ ...delivery, userId: 'user-2' });
    await expect(
      Promise.all([
        service.deliverDigestRecipient(delivery),
        service.deliverDigestRecipient(sibling),
      ]),
    ).resolves.toEqual([
      { userId: 'user-1', error: 'outbox unavailable', queued: false },
      { userId: 'user-2', deliveryId: 'delivery-1', queued: true },
    ]);
    expect(queueEmail).toHaveBeenCalledTimes(2);
    expect(queueEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        userId: 'user-2',
        organizationId: 'org-1',
        idempotencyKey:
          'performance-digest/brand-1/2026-08-01T00:00:00.000Z/2026-08-07T23:59:59.999Z',
      }),
    );
  });
});
