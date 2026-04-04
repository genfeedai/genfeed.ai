import { getDashboardPreset } from '@cloud/agent/dashboard/dashboard-presets';
import { describe, expect, it } from 'vitest';

describe('dashboard presets', () => {
  it('builds organization KPI cards with trend and engagement fallback', () => {
    const preset = getDashboardPreset('organization', {
      analytics: {
        avgEngagementRate: 3.52,
        engagementGrowth: -8.2,
        totalBrands: 9,
        totalLikes: 4200,
        totalPosts: 120,
        totalUsers: 15,
        totalViews: 98200,
        viewsGrowth: 12.5,
      },
    });

    const kpiGrid = preset.blocks.find(
      (block) => block.id === 'org-core-kpis' && block.type === 'kpi_grid',
    );
    if (!kpiGrid || kpiGrid.type !== 'kpi_grid') {
      throw new Error('Expected org-core-kpis KPI grid');
    }

    const engagementCard = kpiGrid.cards.find(
      (card) => card.id === 'kpi-totalEngagement',
    );
    expect(engagementCard?.value).toBe('4.2K');
    expect(engagementCard?.trend?.direction).toBe('down');
    expect(engagementCard?.trend?.percentage).toBe(8.2);

    const viewsCard = kpiGrid.cards.find(
      (card) => card.id === 'kpi-totalViews',
    );
    expect(viewsCard?.trend?.direction).toBe('up');
    expect(viewsCard?.trend?.percentage).toBe(12.5);
  });

  it('builds brand derived KPI values and guards division by zero', () => {
    const withPosts = getDashboardPreset('brand', {
      analytics: {
        activePlatforms: ['instagram', 'tiktok'],
        totalPosts: 5,
        totalViews: 1000,
      },
    });

    const withPostsGrid = withPosts.blocks.find(
      (block) => block.id === 'brand-core-kpis' && block.type === 'kpi_grid',
    );
    if (!withPostsGrid || withPostsGrid.type !== 'kpi_grid') {
      throw new Error('Expected brand-core-kpis KPI grid');
    }

    expect(
      withPostsGrid.cards.find((card) => card.id === 'kpi-activePlatformsCount')
        ?.value,
    ).toBe(2);
    expect(
      withPostsGrid.cards.find((card) => card.id === 'kpi-avgViewsPerPost')
        ?.value,
    ).toBe('200');

    const zeroPosts = getDashboardPreset('brand', {
      analytics: {
        activePlatforms: [],
        totalPosts: 0,
        totalViews: 1000,
      },
    });
    const zeroPostsGrid = zeroPosts.blocks.find(
      (block) => block.id === 'brand-core-kpis' && block.type === 'kpi_grid',
    );
    if (!zeroPostsGrid || zeroPostsGrid.type !== 'kpi_grid') {
      throw new Error('Expected brand-core-kpis KPI grid');
    }
    expect(
      zeroPostsGrid.cards.find((card) => card.id === 'kpi-avgViewsPerPost')
        ?.value,
    ).toBe('0');
  });

  it('uses empty_state when chart and top posts are missing', () => {
    const preset = getDashboardPreset('organization', {
      analytics: {},
    });

    const chartEmpty = preset.blocks.find(
      (block) =>
        block.id === 'org-timeseries-empty' && block.type === 'empty_state',
    );
    expect(chartEmpty).toBeDefined();

    const topPostsEmpty = preset.blocks.find(
      (block) => block.id === 'top-posts-empty' && block.type === 'empty_state',
    );
    expect(topPostsEmpty).toBeDefined();
  });

  it('shows only available secondary superadmin cards', () => {
    const preset = getDashboardPreset('superadmin', {
      analytics: {
        activeBots: 4,
        totalBrands: 10,
        totalImages: 30,
        totalModels: 8,
        totalOrganizations: 2,
        totalSubscriptions: 120,
        totalUsers: 40,
        totalVideos: 20,
      },
    });

    const secondary = preset.blocks.find(
      (block) =>
        block.id === 'superadmin-secondary-kpis' && block.type === 'kpi_grid',
    );
    if (!secondary || secondary.type !== 'kpi_grid') {
      throw new Error('Expected superadmin-secondary-kpis grid');
    }

    const cardIds = secondary.cards.map((card) => card.id);
    expect(cardIds).toContain('kpi-activeBots');
    expect(cardIds).toContain('kpi-totalModels');
    expect(cardIds).not.toContain('kpi-pendingPosts');
  });

  it('zero-fills superadmin growth data and falls back to empty tables when analytics data is missing', () => {
    const preset = getDashboardPreset('superadmin', {
      analytics: {},
    });

    const secondary = preset.blocks.find(
      (block) =>
        block.id === 'superadmin-secondary-kpis' && block.type === 'kpi_grid',
    );
    expect(secondary).toBeUndefined();

    const growth = preset.blocks.find(
      (block) => block.id === 'superadmin-growth' && block.type === 'chart',
    );
    if (!growth || growth.type !== 'chart') {
      throw new Error('Expected superadmin-growth chart');
    }

    expect(growth.data).toHaveLength(3);
    expect(growth.data.map((row) => row.value)).toEqual([0, 0, 0]);

    const organizationsEmpty = preset.blocks.find(
      (block) =>
        block.id === 'superadmin-organizations-table-empty' &&
        block.type === 'empty_state',
    );
    expect(organizationsEmpty).toBeDefined();

    const brandsEmpty = preset.blocks.find(
      (block) =>
        block.id === 'superadmin-brands-table-empty' &&
        block.type === 'empty_state',
    );
    expect(brandsEmpty).toBeDefined();
  });
});
