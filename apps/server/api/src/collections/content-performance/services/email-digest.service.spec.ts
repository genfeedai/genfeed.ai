import { EmailDigestService } from '@api/collections/content-performance/services/email-digest.service';
import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { SERVER_TOKENS } from '@api/server.dependencies';
import { EmailPerformanceService } from '@api/services/email-performance/email-performance.service';
import { ConfigService } from '@libs/config/config.service';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const summary = {
  dataset: {
    confidence: 'none' as const,
    totalPosts: 0,
    importedPosts: 0,
    genfeedPosts: 0,
  },
  topPerformers: [],
  worstPerformers: [],
  avgEngagementByPlatform: [],
  avgEngagementByContentType: [],
  bestPostingTimes: [],
  topHooks: [],
  weekOverWeekTrend: {
    direction: 'stable' as const,
    percentageChange: 0,
    currentEngagement: 0,
    previousEngagement: 0,
  },
};
const options = {
  organizationId: 'org-1',
  brandId: 'brand-1',
  startDate: '2026-08-01',
  endDate: '2026-08-07',
};

describe('EmailDigestService durable delivery', () => {
  const prisma = {
    organization: { findFirst: vi.fn() },
    brand: { findFirst: vi.fn() },
    member: { findMany: vi.fn(), findFirst: vi.fn() },
  };
  const queueEmail = vi.fn();
  const getWeeklySummary = vi.fn();
  let service: EmailDigestService;
  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.organization.findFirst.mockResolvedValue({
      userId: 'owner-1',
      label: 'Test org',
      slug: 'test-org',
    });
    prisma.brand.findFirst.mockResolvedValue({ slug: 'test-brand' });
    prisma.member.findFirst.mockResolvedValue({ userId: 'owner-1' });
    queueEmail.mockResolvedValue('delivery-1');
    getWeeklySummary.mockResolvedValue(summary);
    const module = await Test.createTestingModule({
      providers: [
        EmailDigestService,
        { provide: PerformanceSummaryService, useValue: { getWeeklySummary } },
        { provide: EmailPerformanceService, useValue: { queueEmail } },
        { provide: SERVER_TOKENS.prisma, useValue: prisma },
        { provide: SERVER_TOKENS.logger, useValue: { error: vi.fn() } },
        {
          provide: ConfigService,
          useValue: { get: vi.fn(() => 'https://app.genfeed.ai') },
        },
      ],
    }).compile();
    service = module.get(EmailDigestService);
  });

  it('resolves the canonical owner, renders a tracked CTA, and queues a stable window once per user', async () => {
    const prepared = await service.prepareDigest(options);
    const state = await service.discoverDigestRecipients(prepared);
    expect(state.recipientUserIds).toEqual(['owner-1']);
    const rendered = service.renderDigest(state);
    expect(rendered.deliveries[0].html).toContain('href="{{emailActionUrl}}"');
    expect(rendered.deliveries[0]).toMatchObject({
      userId: 'owner-1',
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-07T23:59:59.999Z',
    });
    await expect(
      service.deliverDigestRecipient(rendered.deliveries[0]),
    ).resolves.toEqual({
      userId: 'owner-1',
      queued: true,
      deliveryId: 'delivery-1',
    });
    expect(queueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'content.weekly',
        templateKey: 'performance-digest',
        userId: 'owner-1',
        organizationId: 'org-1',
        goal: 'publish_content',
        destinationUrl:
          'https://app.genfeed.ai/test-org/test-brand/library/assets',
        idempotencyKey:
          'performance-digest/brand-1/2026-08-01T00:00:00.000Z/2026-08-07T23:59:59.999Z',
      }),
    );
  });

  it('rejects external recipient overrides before rendering or queueing', async () => {
    prisma.member.findMany.mockResolvedValue([]);
    const prepared = await service.prepareDigest({
      ...options,
      recipientEmails: ['external@example.com'],
    });
    await expect(
      service.discoverDigestRecipients(prepared),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          isActive: true,
          isDeleted: false,
        }),
      }),
    );
    expect(queueEmail).not.toHaveBeenCalled();
  });

  it('deduplicates case-insensitive member recipients and persists IDs rather than addresses', async () => {
    prisma.member.findMany.mockResolvedValue([
      { user: { id: 'member-1', email: 'MEMBER@example.com' } },
    ]);
    const prepared = await service.prepareDigest({
      ...options,
      recipientEmails: [' member@example.com ', 'MEMBER@example.com'],
    });
    const state = await service.discoverDigestRecipients(prepared);
    expect(state.recipientUserIds).toEqual(['member-1']);
    expect(service.renderDigest(state).deliveries[0]).not.toHaveProperty(
      'email',
    );
  });

  it('skips a default owner who is no longer an active member', async () => {
    prisma.member.findFirst.mockResolvedValue(null);
    const state = await service.discoverDigestRecipients(
      await service.prepareDigest(options),
    );
    expect(service.renderDigest(state).deliveries).toEqual([]);
  });

  it('does not query analytics for an unavailable or cross-organization brand', async () => {
    prisma.brand.findFirst.mockResolvedValue(null);
    await expect(service.prepareDigest(options)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.brand.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'brand-1', organizationId: 'org-1', isDeleted: false },
      }),
    );
    expect(getWeeklySummary).not.toHaveBeenCalled();
  });

  it('reports queue persistence failure without claiming successful delivery', async () => {
    queueEmail.mockRejectedValue(new Error('database unavailable'));
    const rendered = service.renderDigest(
      await service.discoverDigestRecipients(
        await service.prepareDigest(options),
      ),
    );
    await expect(
      service.deliverDigestRecipient(rendered.deliveries[0]),
    ).resolves.toEqual({
      userId: 'owner-1',
      queued: false,
      error: 'database unavailable',
    });
  });

  it('normalizes default dates before workflow dispatch and rejects invalid periods', () => {
    expect(
      service.normalizeOptions({ organizationId: 'org-1', brandId: 'brand-1' }),
    ).toMatchObject({
      startDate: expect.stringMatching(/T00:00:00.000Z$/),
      endDate: expect.stringMatching(/T23:59:59.999Z$/),
    });
    expect(() =>
      service.normalizeOptions({ ...options, startDate: 'invalid' }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.normalizeOptions({ ...options, startDate: '2025-01-01' }),
    ).toThrow(BadRequestException);
  });
});
