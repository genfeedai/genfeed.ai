import type {
  ServerLogger,
  ServerNotifications,
  ServerPrisma,
} from '@api/server.dependencies';
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
  let sendEmail: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendEmail = vi.fn().mockResolvedValue(undefined);
    service = new EmailDigestService(
      {
        getWeeklySummary: vi.fn().mockResolvedValue(summary),
      } as unknown as PerformanceSummaryService,
      { sendEmail } as unknown as ServerNotifications,
      {
        organization: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'org-1',
            label: 'Acme',
            userId: 'user-1',
          }),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue({ email: 'owner@acme.test' }),
        },
      } as unknown as ServerPrisma,
      {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as ServerLogger,
    );
  });

  it('prepares, discovers, and renders one immutable delivery item', async () => {
    const prepared = await service.prepareDigest({
      brandId: 'brand-1',
      organizationId: 'org-1',
    });
    const discovered = await service.discoverDigestRecipients(prepared);
    const rendered = service.renderDigest(discovered);

    expect(rendered.deliveries).toEqual([
      expect.objectContaining({
        email: 'owner@acme.test',
        subject: 'Weekly Performance Digest - Acme',
      }),
    ]);
    expect(rendered.deliveries[0]?.html).toContain('Weekly Performance Digest');
  });

  it('returns a failed recipient result without failing sibling fanout items', async () => {
    sendEmail.mockRejectedValue(new Error('provider unavailable'));
    await expect(
      service.deliverDigestRecipient({
        email: 'owner@acme.test',
        html: '<p>Digest</p>',
        subject: 'Digest',
      }),
    ).resolves.toEqual({
      email: 'owner@acme.test',
      error: 'provider unavailable',
      sent: false,
    });
  });
});
