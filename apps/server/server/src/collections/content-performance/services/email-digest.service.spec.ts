import type {
  ServerLogger,
  ServerNotifications,
  ServerPrisma,
} from '@server/server.dependencies';
import { EmailDigestService } from './email-digest.service';
import type {
  PerformanceSummaryService,
  WeeklySummary,
} from './performance-summary.service';

function makeSummary(overrides: Partial<WeeklySummary> = {}): WeeklySummary {
  return {
    avgEngagementByContentType: [],
    avgEngagementByPlatform: [
      { avgEngagementRate: 4.5, platform: 'instagram', totalPosts: 3 },
    ],
    bestPostingTimes: [{ avgEngagementRate: 6, hour: 14, postCount: 2 }],
    topHooks: ['A great hook'],
    topPerformers: [
      {
        comments: 5,
        description: 'desc',
        engagementRate: 4.5,
        likes: 10,
        platform: 'instagram',
        postId: 'post-1',
        saves: 2,
        shares: 3,
        title: 'Top post',
        views: 12_345,
      },
    ],
    weekOverWeekTrend: {
      currentEngagement: 200,
      direction: 'up',
      percentageChange: 100,
      previousEngagement: 100,
    },
    worstPerformers: [],
    ...overrides,
  };
}

describe('EmailDigestService', () => {
  const getWeeklySummary = vi.fn();
  const sendEmail = vi.fn();
  const orgFindUnique = vi.fn();
  const userFindUnique = vi.fn();

  const performanceSummary = {
    getWeeklySummary,
  } as unknown as PerformanceSummaryService;

  const notifications = { sendEmail } satisfies ServerNotifications;

  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } satisfies ServerLogger;

  const prisma = {
    organization: { findUnique: orgFindUnique },
    user: { findUnique: userFindUnique },
  } as unknown as ServerPrisma;

  let service: EmailDigestService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EmailDigestService(
      performanceSummary,
      notifications,
      prisma,
      logger,
    );
    getWeeklySummary.mockResolvedValue(makeSummary());
    sendEmail.mockResolvedValue(undefined);
    orgFindUnique.mockResolvedValue({
      id: 'org-1',
      label: 'Acme Co',
      userId: 'user-1',
    });
    userFindUnique.mockResolvedValue({ email: 'owner@acme.test' });
  });

  describe('sendDigest', () => {
    it('sends the digest to the organization owner', async () => {
      const result = await service.sendDigest({
        brandId: 'brand-1',
        organizationId: 'org-1',
      });

      expect(result).toEqual({ errors: 0, sent: 1, skipped: 0 });
      expect(sendEmail).toHaveBeenCalledWith(
        'owner@acme.test',
        'Weekly Performance Digest - Acme Co',
        expect.stringContaining('Weekly Performance Digest'),
      );
    });

    it('prefers explicit recipients over the organization owner', async () => {
      const result = await service.sendDigest({
        brandId: 'brand-1',
        organizationId: 'org-1',
        recipientEmails: ['a@test.dev', 'b@test.dev'],
      });

      expect(result.sent).toBe(2);
      expect(userFindUnique).not.toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalledWith(
        'a@test.dev',
        expect.any(String),
        expect.any(String),
      );
    });

    it('passes the requested date range through to the summary', async () => {
      await service.sendDigest({
        brandId: 'brand-1',
        endDate: '2026-07-31',
        organizationId: 'org-1',
        startDate: '2026-07-01',
      });

      expect(getWeeklySummary).toHaveBeenCalledWith('org-1', 'brand-1', {
        endDate: '2026-07-31',
        startDate: '2026-07-01',
      });
    });

    it('skips when the organization has no owner user', async () => {
      orgFindUnique.mockResolvedValue({ id: 'org-1', userId: null });

      const result = await service.sendDigest({
        brandId: 'brand-1',
        organizationId: 'org-1',
      });

      expect(result).toEqual({ errors: 0, sent: 0, skipped: 1 });
      expect(sendEmail).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'No recipients found for digest email org=org-1',
      );
    });

    it('skips when the organization row is missing entirely', async () => {
      orgFindUnique.mockResolvedValue(null);

      const result = await service.sendDigest({
        brandId: 'brand-1',
        organizationId: 'org-1',
      });

      expect(result.skipped).toBe(1);
    });

    it('skips when the owner user has no email address', async () => {
      userFindUnique.mockResolvedValue({ email: null });

      const result = await service.sendDigest({
        brandId: 'brand-1',
        organizationId: 'org-1',
      });

      expect(result.skipped).toBe(1);
    });

    it('skips when an empty recipient override is supplied and no owner exists', async () => {
      orgFindUnique.mockResolvedValue({ id: 'org-1', userId: null });

      const result = await service.sendDigest({
        brandId: 'brand-1',
        organizationId: 'org-1',
        recipientEmails: [],
      });

      expect(result.skipped).toBe(1);
    });

    it('falls back to a generic organization name when the label is missing', async () => {
      orgFindUnique.mockResolvedValue({ id: 'org-1', userId: 'user-1' });

      await service.sendDigest({
        brandId: 'brand-1',
        organizationId: 'org-1',
      });

      expect(sendEmail).toHaveBeenCalledWith(
        'owner@acme.test',
        'Weekly Performance Digest - Your Organization',
        expect.any(String),
      );
    });

    it('counts a per-recipient send failure without aborting the rest', async () => {
      sendEmail.mockRejectedValueOnce(new Error('smtp down'));

      const result = await service.sendDigest({
        brandId: 'brand-1',
        organizationId: 'org-1',
        recipientEmails: ['a@test.dev', 'b@test.dev'],
      });

      expect(result).toEqual({ errors: 1, sent: 1, skipped: 0 });
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to send digest email to a@test.dev',
        expect.any(Error),
      );
    });

    it('records an error when the summary lookup throws', async () => {
      getWeeklySummary.mockRejectedValue(new Error('summary failed'));

      const result = await service.sendDigest({
        brandId: 'brand-1',
        organizationId: 'org-1',
      });

      expect(result).toEqual({ errors: 1, sent: 0, skipped: 0 });
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to generate digest for org=org-1',
        expect.any(Error),
      );
    });
  });

  describe('buildDigestHtml', () => {
    it('renders an upward trend in green with a plus sign', () => {
      const html = service.buildDigestHtml(makeSummary(), 'Acme Co');

      expect(html).toContain('#10b981');
      expect(html).toContain('+100.0%');
      expect(html).toContain('Up from 100 to 200 engagements.');
    });

    it('renders a downward trend in red with a minus sign', () => {
      const html = service.buildDigestHtml(
        makeSummary({
          weekOverWeekTrend: {
            currentEngagement: 50,
            direction: 'down',
            percentageChange: -50,
            previousEngagement: 100,
          },
        }),
        'Acme Co',
      );

      expect(html).toContain('#FF6166');
      expect(html).toContain('-50.0%');
      expect(html).toContain('Down from');
    });

    it('renders a stable trend in grey with no sign', () => {
      const html = service.buildDigestHtml(
        makeSummary({
          weekOverWeekTrend: {
            currentEngagement: 100,
            direction: 'stable',
            percentageChange: 0,
            previousEngagement: 100,
          },
        }),
        'Acme Co',
      );

      expect(html).toContain('#949494');
      expect(html).toContain('Flat from');
    });

    it('abbreviates thousands and millions in view counts', () => {
      const html = service.buildDigestHtml(makeSummary(), 'Acme Co');
      expect(html).toContain('12.3K');

      const millions = service.buildDigestHtml(
        makeSummary({
          topPerformers: [
            {
              ...makeSummary().topPerformers[0],
              views: 2_500_000,
            },
          ],
        }),
        'Acme Co',
      );
      expect(millions).toContain('2.5M');
    });

    it('renders small view counts verbatim', () => {
      const html = service.buildDigestHtml(
        makeSummary({
          topPerformers: [{ ...makeSummary().topPerformers[0], views: 42 }],
        }),
        'Acme Co',
      );

      expect(html).toContain('>42<');
    });

    it('escapes HTML in the organization name and content titles', () => {
      const html = service.buildDigestHtml(
        makeSummary({
          topPerformers: [
            {
              ...makeSummary().topPerformers[0],
              title: '<script>alert(1)</script>',
            },
          ],
        }),
        '<b>Acme</b>',
      );

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).not.toContain('<b>Acme</b>');
      expect(html).toContain('&lt;');
    });

    it('shows empty-state copy when there is no data at all', () => {
      const html = service.buildDigestHtml(
        makeSummary({
          avgEngagementByPlatform: [],
          bestPostingTimes: [],
          topHooks: [],
          topPerformers: [],
        }),
        'Acme Co',
      );

      expect(html).toContain('No performance data this week.');
      expect(html).toContain('No platform data available.');
      expect(html).toContain('Not enough data yet.');
      expect(html).not.toContain('Top Hooks');
    });

    it('caps the top performers table at five rows', () => {
      const performer = makeSummary().topPerformers[0];
      const html = service.buildDigestHtml(
        makeSummary({
          topPerformers: Array.from({ length: 8 }, (_, i) => ({
            ...performer,
            postId: `post-${i}`,
            title: `Post ${i}`,
          })),
        }),
        'Acme Co',
      );

      expect(html).toContain('Post 4');
      expect(html).not.toContain('Post 5');
    });

    it('caps the best posting times list at three entries', () => {
      const html = service.buildDigestHtml(
        makeSummary({
          bestPostingTimes: [
            { avgEngagementRate: 9, hour: 9, postCount: 1 },
            { avgEngagementRate: 8, hour: 13, postCount: 1 },
            { avgEngagementRate: 7, hour: 0, postCount: 1 },
            { avgEngagementRate: 6, hour: 12, postCount: 1 },
          ],
        }),
        'Acme Co',
      );

      expect(html).toContain('9:00 AM');
      expect(html).toContain('1:00 PM');
      expect(html).toContain('12:00 AM');
      expect(html).not.toContain('12:00 PM');
    });

    it('truncates long content titles to 60 characters', () => {
      const html = service.buildDigestHtml(
        makeSummary({
          topPerformers: [
            { ...makeSummary().topPerformers[0], title: 'y'.repeat(100) },
          ],
        }),
        'Acme Co',
      );

      expect(html).toContain('y'.repeat(60));
      expect(html).not.toContain('y'.repeat(61));
    });

    it('falls back to the description then to Untitled for the row label', () => {
      const base = makeSummary().topPerformers[0];

      const fromDescription = service.buildDigestHtml(
        makeSummary({
          topPerformers: [{ ...base, description: 'desc only', title: '' }],
        }),
        'Acme Co',
      );
      expect(fromDescription).toContain('desc only');

      const untitled = service.buildDigestHtml(
        makeSummary({
          topPerformers: [{ ...base, description: '', title: '' }],
        }),
        'Acme Co',
      );
      expect(untitled).toContain('Untitled');
    });

    it('renders the top hooks section when hooks are present', () => {
      const html = service.buildDigestHtml(makeSummary(), 'Acme Co');

      expect(html).toContain('Top Hooks');
      expect(html).toContain('A great hook');
    });
  });
});
