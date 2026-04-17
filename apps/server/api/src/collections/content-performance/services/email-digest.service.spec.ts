import { EmailDigestService } from '@api/collections/content-performance/services/email-digest.service';
import type { WeeklySummary } from '@api/collections/content-performance/services/performance-summary.service';
import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

describe('EmailDigestService', () => {
  let service: EmailDigestService;
  let mockPerformanceSummaryService: Record<string, ReturnType<typeof vi.fn>>;
  let mockNotificationsService: { sendEmail: ReturnType<typeof vi.fn> };
  let mockOrganizationModel: Record<string, ReturnType<typeof vi.fn>>;
  let mockUserModel: Record<string, ReturnType<typeof vi.fn>>;
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const orgId = 'test-object-id'.toString();
  const brandId = 'test-object-id'.toString();
  const userId = 'test-object-id';

  const mockSummary: WeeklySummary = {
    avgEngagementByContentType: [
      { avgEngagementRate: 4.5, category: 'image', totalPosts: 10 },
    ],
    avgEngagementByPlatform: [
      { avgEngagementRate: 5.2, platform: 'instagram', totalPosts: 15 },
    ],
    bestPostingTimes: [{ avgEngagementRate: 6.1, hour: 14, postCount: 8 }],
    topHooks: ['Check out this amazing...', "You won't believe..."],
    topPerformers: [
      {
        comments: 50,
        description: 'A great post about AI',
        engagementRate: 8.5,
        likes: 200,
        platform: 'instagram',
        postId: 'post-1',
        saves: 30,
        shares: 40,
        title: 'AI Content Creation',
        views: 5000,
      },
    ],
    weekOverWeekTrend: {
      currentEngagement: 1500,
      direction: 'up',
      percentageChange: 15.5,
      previousEngagement: 1300,
    },
    worstPerformers: [],
  };

  beforeEach(async () => {
    mockPerformanceSummaryService = {
      getWeeklySummary: vi.fn().mockResolvedValue(mockSummary),
    };

    mockNotificationsService = {
      sendEmail: vi.fn().mockResolvedValue(undefined),
    };

    mockOrganizationModel = {
      findById: vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue({
            _id: orgId,
            label: 'Test Org',
            user: userId,
          }),
        }),
      }),
    };

    mockUserModel = {
      findById: vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue({
            _id: userId,
            email: 'test@example.com',
          }),
        }),
      }),
    };

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        EmailDigestService,
        {
          provide: PerformanceSummaryService,
          useValue: mockPerformanceSummaryService,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
        {
          provide: PrismaService,
          useValue: { ...mockOrganizationModel, ...mockUserModel },
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get(EmailDigestService);
  });

  describe('sendDigest', () => {
    it('should send digest email to org owner', async () => {
      const result = await service.sendDigest({
        brandId,
        organizationId: orgId,
      });

      expect(result.sent).toBe(1);
      expect(result.errors).toBe(0);
      expect(mockNotificationsService.sendEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringContaining('Weekly Performance Digest'),
        expect.stringContaining('Top Performers'),
      );
    });

    it('should send to override recipients when provided', async () => {
      const result = await service.sendDigest({
        brandId,
        organizationId: orgId,
        recipientEmails: ['a@test.com', 'b@test.com'],
      });

      expect(result.sent).toBe(2);
      expect(mockNotificationsService.sendEmail).toHaveBeenCalledTimes(2);
    });

    it('should skip when no recipients found', async () => {
      mockOrganizationModel.findById.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue({ _id: orgId, user: userId }),
        }),
      });
      mockUserModel.findById.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue({ _id: userId }),
        }),
      });

      const result = await service.sendDigest({
        brandId,
        organizationId: orgId,
      });

      expect(result.skipped).toBe(1);
      expect(result.sent).toBe(0);
    });

    it('should handle email send failure gracefully', async () => {
      mockNotificationsService.sendEmail.mockRejectedValueOnce(
        new Error('SMTP error'),
      );

      const result = await service.sendDigest({
        brandId,
        organizationId: orgId,
      });

      expect(result.errors).toBe(1);
      expect(result.sent).toBe(0);
    });
  });

  describe('buildDigestHtml', () => {
    it('should generate valid HTML with summary data', () => {
      const html = service.buildDigestHtml(mockSummary, 'Test Org');

      expect(html).toContain('Weekly Performance Digest');
      expect(html).toContain('Test Org');
      expect(html).toContain('Top Performers');
      expect(html).toContain('AI Content Creation');
      expect(html).toContain('instagram');
      expect(html).toContain('15.5%');
      expect(html).toContain('Best Posting Times');
    });

    it('should escape HTML in content', () => {
      const summaryWithXss = {
        ...mockSummary,
        topPerformers: [
          {
            ...mockSummary.topPerformers[0],
            title: '<script>alert("xss")</script>',
          },
        ],
      };

      const html = service.buildDigestHtml(summaryWithXss, 'Test Org');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should handle empty summary gracefully', () => {
      const emptySummary: WeeklySummary = {
        avgEngagementByContentType: [],
        avgEngagementByPlatform: [],
        bestPostingTimes: [],
        topHooks: [],
        topPerformers: [],
        weekOverWeekTrend: {
          currentEngagement: 0,
          direction: 'stable',
          percentageChange: 0,
          previousEngagement: 0,
        },
        worstPerformers: [],
      };

      const html = service.buildDigestHtml(emptySummary, 'Test Org');
      expect(html).toContain('No performance data this week');
    });
  });
});
