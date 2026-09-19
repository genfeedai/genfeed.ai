import { EmailDigestService } from '@api/collections/content-performance/services/email-digest.service';
import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { SERVER_TOKENS } from '@api/server.dependencies';
import { EmailPerformanceService } from '@api/services/email-performance/email-performance.service';
import { HarnessWinnerPromotionService } from '@api/services/harness/harness-winner-promotion.service';
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
  const listPromotedWinners = vi.fn();
  const findTopForBrand = vi.fn();
  const getActiveForBrand = vi.fn();
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
    listPromotedWinners.mockResolvedValue([]);
    findTopForBrand.mockResolvedValue([]);
    getActiveForBrand.mockResolvedValue(null);
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
        {
          provide: HarnessWinnerPromotionService,
          useValue: { listPromotedWinners },
        },
        { provide: CreativePatternsService, useValue: { findTopForBrand } },
        { provide: HarnessProfilesService, useValue: { getActiveForBrand } },
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
        topic: 'content.digest',
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

  describe('Expert Path "What won" / "Record next" digest sections', () => {
    it('adds a "What won" table, the pattern, and a "Record next" prompt for an EXPERT organization', async () => {
      prisma.organization.findFirst.mockResolvedValue({
        accountType: 'EXPERT',
        label: 'Test org',
        slug: 'test-org',
        userId: 'owner-1',
      });
      listPromotedWinners.mockResolvedValue([
        {
          content:
            'Winning post on tiktok (9.10% engagement): Stop chasing virality.',
          engagementRate: 9.1,
          platform: 'tiktok',
          postId: 'post-1',
          promotedAt: '2026-08-05T00:00:00.000Z',
        },
      ]);
      findTopForBrand.mockResolvedValue([
        {
          description: 'Open with a contrarian claim, then prove it fast.',
          label: 'Contrarian opener',
        },
      ]);
      getActiveForBrand.mockResolvedValue({
        positioning: { weakestDimension: 'authoritySignals' },
      });

      const rendered = service.renderDigest(
        await service.discoverDigestRecipients(
          await service.prepareDigest(options),
        ),
      );
      const html = rendered.deliveries[0].html;

      expect(html).toContain('What won');
      expect(html).toContain('tiktok');
      expect(html).toContain('9.10%');
      expect(html).toContain(
        'Open with a contrarian claim, then prove it fast.',
      );
      expect(html).toContain('Record next');
      expect(html).toContain('authority signals');
      expect(html).toContain(
        'https://app.genfeed.ai/test-org/test-brand/settings/knowledge',
      );
    });

    it('prompts for a corpus addition instead of "What won" when no winners were promoted', async () => {
      prisma.organization.findFirst.mockResolvedValue({
        accountType: 'EXPERT',
        label: 'Test org',
        slug: 'test-org',
        userId: 'owner-1',
      });
      listPromotedWinners.mockResolvedValue([]);
      findTopForBrand.mockResolvedValue([]);
      getActiveForBrand.mockResolvedValue(null);

      const rendered = service.renderDigest(
        await service.discoverDigestRecipients(
          await service.prepareDigest(options),
        ),
      );
      const html = rendered.deliveries[0].html;

      expect(html).toContain('No ideas were promoted this week');
      expect(html).toContain(
        'https://app.genfeed.ai/test-org/test-brand/settings/knowledge',
      );
    });

    it('leaves the digest unchanged for a non-EXPERT organization', async () => {
      prisma.organization.findFirst.mockResolvedValue({
        accountType: 'CREATOR',
        label: 'Test org',
        slug: 'test-org',
        userId: 'owner-1',
      });

      const rendered = service.renderDigest(
        await service.discoverDigestRecipients(
          await service.prepareDigest(options),
        ),
      );
      const html = rendered.deliveries[0].html;

      expect(html).not.toContain('What won');
      expect(html).not.toContain('Record next');
      expect(listPromotedWinners).not.toHaveBeenCalled();
      expect(findTopForBrand).not.toHaveBeenCalled();
      expect(getActiveForBrand).not.toHaveBeenCalled();
    });

    it('renders byte-for-byte identical HTML whether a non-expert `expert` object is passed or omitted', () => {
      const withoutExpertArg = service.buildDigestHtml(
        summary,
        'Test org',
        'https://app.genfeed.ai/test-org/test-brand/library/assets',
      );
      const withNonExpertData = service.buildDigestHtml(
        summary,
        'Test org',
        'https://app.genfeed.ai/test-org/test-brand/library/assets',
        {
          corpusUrl:
            'https://app.genfeed.ai/test-org/test-brand/settings/knowledge',
          isExpert: false,
          patternText: null,
          recordNextPrompt: '',
          winners: [],
        },
      );

      expect(withNonExpertData).toBe(withoutExpertArg);
    });
  });
});
