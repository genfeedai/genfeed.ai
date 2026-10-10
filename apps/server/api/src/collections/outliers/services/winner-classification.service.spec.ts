import type { OutlierConfigurationService } from '@api/collections/outliers/services/outlier-configuration.service';
import { WinnerClassificationService } from '@api/collections/outliers/services/winner-classification.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

const NOW = new Date('2026-10-10T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const CONFIG = {
  breakoutThreshold: 10,
  maturityHoursByPlatform: {},
  minimumSampleSize: 5,
  outlierThreshold: 3,
  windowSize: 20,
};

interface RowOverrides {
  credentialId?: string | null;
  date?: Date;
  engagementRate?: number;
  metricAvailability?: Record<string, string> | null;
  platform?: string;
  totalComments?: number;
  totalLikes?: number;
  totalViews?: number;
}

function row(postId: string, daysAgo: number, overrides: RowOverrides = {}) {
  return {
    credentialId: 'credential-a',
    engagementRate: 2,
    isPinned: false,
    isPromoted: false,
    metricAvailability: { views: 'observed' },
    platform: 'INSTAGRAM',
    post: {
      category: 'VIDEO',
      credentialId: 'credential-a',
      description: `${postId} description`,
      id: postId,
      isDeleted: false,
      label: postId,
      publicationDate: null,
      publishedAt: new Date(NOW.getTime() - daysAgo * DAY),
    },
    totalComments: 10,
    totalLikes: 100,
    totalViews: 1000,
    ...overrides,
  };
}

function history(count = 8) {
  return Array.from({ length: count }, (_, i) => row(`history-${i}`, i + 10));
}

function createService(rows: unknown[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const resolve = vi.fn().mockResolvedValue(CONFIG);
  const service = new WinnerClassificationService(
    { postAnalytics: { findMany } } as unknown as PrismaService,
    { resolve } as unknown as OutlierConfigurationService,
  );
  return { findMany, resolve, service };
}

describe('WinnerClassificationService (#5502)', () => {
  it('scopes the analytics read to the organization and brand', async () => {
    const { findMany, resolve, service } = createService([]);

    await service.findWinners(
      { brandId: 'brand-a', organizationId: 'org-a', platform: 'instagram' },
      NOW,
    );

    expect(resolve).toHaveBeenCalledWith('org-a');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-a',
          isDeleted: false,
          organizationId: 'org-a',
          platform: 'INSTAGRAM',
        }),
      }),
    );
  });

  it('returns a post that beats its baseline on any signal, with evidence', async () => {
    const { service } = createService([
      row('winner', 3, { totalComments: 60 }),
      ...history(),
    ]);

    const winners = await service.findWinners(
      { brandId: 'brand-a', organizationId: 'org-a' },
      NOW,
    );

    expect(winners).toHaveLength(1);
    expect(winners[0]).toMatchObject({
      contentType: 'video',
      platform: 'instagram',
      postId: 'winner',
      totalComments: 60,
    });
    expect(winners[0].evidence).toEqual([
      expect.objectContaining({
        baseline: 10,
        ratio: 6,
        signal: 'comments',
        tier: 'outlier',
        value: 60,
      }),
    ]);
  });

  it('reads only the latest analytics row per post and platform', async () => {
    const { service } = createService([
      row('winner', 3, { date: NOW }),
      row('winner', 3, {
        date: new Date(NOW.getTime() - DAY),
        totalLikes: 900,
      }),
      ...history(),
    ]);

    const winners = await service.findWinners(
      { brandId: 'brand-a', organizationId: 'org-a' },
      NOW,
    );

    expect(winners).toEqual([]);
  });

  it('never qualifies on views that were not observed', async () => {
    const { service } = createService([
      row('estimated', 3, {
        engagementRate: 20,
        metricAvailability: { views: 'estimated' },
        totalViews: 50_000,
      }),
      ...history(),
    ]);

    const winners = await service.findWinners(
      { brandId: 'brand-a', organizationId: 'org-a' },
      NOW,
    );

    expect(winners).toEqual([]);
  });

  it('labels nothing without enough mature history', async () => {
    const { service } = createService([
      row('lonely', 3, { totalViews: 90_000 }),
      ...history(3),
    ]);

    const winners = await service.findWinners(
      { brandId: 'brand-a', organizationId: 'org-a' },
      NOW,
    );

    expect(winners).toEqual([]);
  });

  it('compares each account only against its own baseline', async () => {
    const { service } = createService([
      row('other-account', 3, {
        credentialId: 'credential-b',
        totalViews: 9000,
      }),
      ...history(),
    ]);

    const winners = await service.findWinners(
      { brandId: 'brand-a', organizationId: 'org-a' },
      NOW,
    );

    expect(winners).toEqual([]);
  });

  it('keeps winners published inside the requested window, best ratio first', async () => {
    const { service } = createService([
      row('recent', 3, { totalViews: 4000 }),
      row('strongest', 4, { totalViews: 12_000 }),
      row('old', 9, { totalViews: 20_000 }),
      ...history(),
    ]);

    const winners = await service.findWinners(
      {
        brandId: 'brand-a',
        organizationId: 'org-a',
        publishedFrom: new Date(NOW.getTime() - 7 * DAY),
        publishedTo: NOW,
      },
      NOW,
    );

    expect(winners.map((winner) => winner.postId)).toEqual([
      'strongest',
      'recent',
    ]);
    expect(winners[0].evidence[0]).toMatchObject({
      signal: 'views',
      tier: 'breakout',
    });
  });
});
