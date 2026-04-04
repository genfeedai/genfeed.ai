import type {
  AgentDashboardOperation,
  AgentUIBlock,
  DashboardBlockPreset,
  DashboardKpiDefinition,
  DashboardKpiKey,
  DashboardPresetData,
  DashboardScopePreset,
  IAnalytics,
  MetricCardBlock,
  TopPostItem,
} from '@genfeedai/interfaces';

const DEFAULT_OPERATION: AgentDashboardOperation = 'replace';

export const DASHBOARD_KPI_CATALOG: DashboardKpiDefinition[] = [
  {
    description: 'Total active brands',
    format: 'number',
    key: 'totalBrands',
    label: 'Total Brands',
    scopes: ['organization', 'superadmin'],
  },
  {
    description: 'Published content pieces',
    format: 'number',
    key: 'totalPosts',
    label: 'Total Posts',
    scopes: ['organization', 'brand'],
  },
  {
    description: 'Organization members',
    format: 'number',
    key: 'totalUsers',
    label: 'Total Members',
    scopes: ['organization', 'superadmin'],
  },
  {
    description: 'Total content views',
    format: 'compact',
    key: 'totalViews',
    label: 'Total Views',
    scopes: ['organization', 'brand'],
    trendKey: 'viewsGrowth',
  },
  {
    description: 'Total audience interactions',
    fallbackKeys: ['totalLikes'],
    format: 'compact',
    key: 'totalEngagement',
    label: 'Total Engagement',
    scopes: ['organization', 'brand'],
    trendKey: 'engagementGrowth',
  },
  {
    description: 'Average engagement rate',
    format: 'percent',
    key: 'avgEngagementRate',
    label: 'Engagement Rate',
    scopes: ['organization', 'brand'],
  },
  {
    description: 'Connected social channels',
    format: 'number',
    key: 'activePlatformsCount',
    label: 'Active Platforms',
    scopes: ['brand'],
  },
  {
    description: 'Average views per published post',
    format: 'compact',
    key: 'avgViewsPerPost',
    label: 'Avg Views/Post',
    scopes: ['brand'],
  },
  {
    description: 'Active subscriptions',
    format: 'number',
    key: 'totalSubscriptions',
    label: 'Total Subscriptions',
    scopes: ['superadmin'],
  },
  {
    description: 'Total organizations',
    format: 'number',
    key: 'totalOrganizations',
    label: 'Total Organizations',
    scopes: ['superadmin'],
  },
  {
    description: 'Generated videos',
    format: 'number',
    key: 'totalVideos',
    label: 'Total Videos',
    scopes: ['superadmin'],
  },
  {
    description: 'Generated images',
    format: 'number',
    key: 'totalImages',
    label: 'Total Images',
    scopes: ['superadmin'],
  },
  {
    description: 'Active workflows',
    format: 'number',
    key: 'activeWorkflows',
    label: 'Active Workflows',
    scopes: ['superadmin'],
  },
  {
    description: 'Active bots',
    format: 'number',
    key: 'activeBots',
    label: 'Active Bots',
    scopes: ['superadmin'],
  },
  {
    description: 'Total AI models',
    format: 'number',
    key: 'totalModels',
    label: 'Total Models',
    scopes: ['superadmin'],
  },
  {
    description: 'Pending post approvals',
    format: 'number',
    key: 'pendingPosts',
    label: 'Pending Posts',
    scopes: ['superadmin'],
  },
  {
    description: 'Recent activity count',
    format: 'number',
    key: 'recentActivities',
    label: 'Recent Activities',
    scopes: ['superadmin'],
  },
  {
    description: 'Total available credits',
    format: 'number',
    key: 'totalCredits',
    label: 'Total Credits',
    scopes: ['superadmin'],
  },
];

interface KpiCardContext {
  analytics: Partial<IAnalytics>;
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function resolveDerivedKpiValue(
  key: DashboardKpiKey,
  analytics: Partial<IAnalytics>,
): number | undefined {
  if (key === 'activePlatformsCount') {
    return Array.isArray(analytics.activePlatforms)
      ? analytics.activePlatforms.length
      : 0;
  }

  if (key === 'avgViewsPerPost') {
    const posts = toNumber(analytics.totalPosts);
    if (posts === 0) {
      return 0;
    }
    return toNumber(analytics.totalViews) / posts;
  }

  return undefined;
}

function resolveKpiValue(
  definition: DashboardKpiDefinition,
  analytics: Partial<IAnalytics>,
): number {
  const derived = resolveDerivedKpiValue(definition.key, analytics);
  if (derived !== undefined) {
    return derived;
  }

  const primary = analytics[definition.key as keyof IAnalytics];
  if (typeof primary === 'number' && Number.isFinite(primary)) {
    return primary;
  }

  for (const fallbackKey of definition.fallbackKeys ?? []) {
    const fallbackValue = analytics[fallbackKey];
    if (typeof fallbackValue === 'number' && Number.isFinite(fallbackValue)) {
      return fallbackValue;
    }
  }

  return 0;
}

function formatKpiValue(
  value: number,
  format: DashboardKpiDefinition['format'],
) {
  if (format === 'percent') {
    return `${value.toFixed(2)}%`;
  }
  if (format === 'compact') {
    return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(
      value,
    );
  }
  return Math.round(value * 100) / 100;
}

function toTrendDirection(value: number): 'up' | 'down' | 'flat' {
  if (value > 0) {
    return 'up';
  }
  if (value < 0) {
    return 'down';
  }
  return 'flat';
}

function buildKpiCard(
  definition: DashboardKpiDefinition,
  context: KpiCardContext,
): MetricCardBlock {
  const rawValue = resolveKpiValue(definition, context.analytics);
  const card: MetricCardBlock = {
    id: `kpi-${definition.key}`,
    subtitle: definition.description,
    title: definition.label,
    type: 'metric_card',
    value: formatKpiValue(rawValue, definition.format),
  };

  if (definition.trendKey) {
    const rawTrend = toNumber(context.analytics[definition.trendKey]);
    card.trend = {
      direction: toTrendDirection(rawTrend),
      percentage: Math.abs(rawTrend),
    };
  }

  return card;
}

function buildChartBlock(
  id: string,
  title: string,
  data: Array<Record<string, unknown>> | undefined,
  chartType: 'line' | 'bar' | 'area',
  xAxis: string,
  series: Array<{ key: string; label: string; color?: string }>,
): AgentUIBlock {
  if (!data || data.length === 0) {
    return {
      id: `${id}-empty`,
      message: `No ${title.toLowerCase()} data available for this period.`,
      title,
      type: 'empty_state',
      width: 'full',
    };
  }

  return {
    chartType,
    data,
    id,
    series,
    title,
    type: 'chart',
    width: 'full',
    xAxis,
  };
}

function buildTableBlock(
  id: string,
  title: string,
  rows: Array<Record<string, unknown>> | undefined,
  columns: Array<{ key: string; label: string; sortable?: boolean }>,
): AgentUIBlock {
  if (!rows || rows.length === 0) {
    return {
      id: `${id}-empty`,
      message: `No ${title.toLowerCase()} available yet.`,
      title,
      type: 'empty_state',
      width: 'full',
    };
  }

  return {
    columns,
    id,
    pageSize: 5,
    rows,
    title,
    type: 'table',
    width: 'full',
  };
}

function normalizeTopPosts(
  rows: Array<Record<string, unknown>>,
): TopPostItem[] {
  return rows.slice(0, 5).map((row, index) => {
    const rawId = row.postId ?? row.id ?? row.ingredientId;
    const id = typeof rawId === 'string' ? rawId : `post-${index + 1}`;
    const title = typeof row.title === 'string' ? row.title : undefined;
    const platform =
      typeof row.platform === 'string' ? row.platform : undefined;
    const views = toNumber(row.views);
    const engagement = toNumber(
      row.engagementRate ?? row.likes ?? row.engagement,
    );

    return {
      engagement,
      id,
      platform,
      title,
      views,
    };
  });
}

function buildTopPostsBlock(
  rows: Array<Record<string, unknown>> | undefined,
): AgentUIBlock {
  if (!rows || rows.length === 0) {
    return {
      id: 'top-posts-empty',
      message: 'No top posts are available for the selected period.',
      title: 'Top Posts',
      type: 'empty_state',
      width: 'full',
    };
  }

  return {
    id: 'top-posts',
    layout: 'list',
    posts: normalizeTopPosts(rows),
    title: 'Top Posts',
    type: 'top_posts',
    width: 'full',
  };
}

function buildKpiGrid(
  id: string,
  scope: DashboardScopePreset,
  analytics: Partial<IAnalytics>,
  columns = 3,
): AgentUIBlock {
  const cards = DASHBOARD_KPI_CATALOG.filter((item) =>
    item.scopes.includes(scope),
  ).map((item) => buildKpiCard(item, { analytics }));

  return {
    cards,
    columns,
    id,
    title: 'KPI Summary',
    type: 'kpi_grid',
    width: 'full',
  };
}

function pickSuperAdminSecondaryCards(
  analytics: Partial<IAnalytics>,
): MetricCardBlock[] {
  const secondaryKeys: Array<DashboardKpiKey> = [
    'activeWorkflows',
    'activeBots',
    'totalModels',
    'pendingPosts',
    'recentActivities',
    'totalCredits',
  ];

  const definitions = DASHBOARD_KPI_CATALOG.filter((item) =>
    secondaryKeys.includes(item.key),
  );

  return definitions
    .filter((definition) => {
      const value = analytics[definition.key as keyof IAnalytics];
      return typeof value === 'number' && Number.isFinite(value);
    })
    .map((definition) => buildKpiCard(definition, { analytics }));
}

function buildOrganizationPreset(
  data: DashboardPresetData,
): DashboardBlockPreset {
  const analytics = data.analytics ?? {};

  return {
    blocks: [
      buildKpiGrid('org-core-kpis', 'organization', analytics),
      buildChartBlock(
        'org-timeseries',
        'Performance Trends',
        data.timeSeriesData,
        'line',
        'date',
        [
          { key: 'views', label: 'Views' },
          { key: 'totalEngagement', label: 'Engagement' },
        ],
      ),
      buildTableBlock('org-brands-table', 'Top Brands', data.brandLeaderboard, [
        { key: 'name', label: 'Brand', sortable: true },
        { key: 'totalPosts', label: 'Posts', sortable: true },
        { key: 'totalEngagement', label: 'Engagement', sortable: true },
        { key: 'totalViews', label: 'Views', sortable: true },
        { key: 'growth', label: 'Growth', sortable: true },
      ]),
      buildTableBlock(
        'org-organizations-table',
        'Top Organizations',
        data.organizationLeaderboard,
        [
          { key: 'organization.name', label: 'Organization', sortable: true },
          { key: 'totalPosts', label: 'Posts', sortable: true },
          { key: 'totalEngagement', label: 'Engagement', sortable: true },
          {
            key: 'avgEngagementRate',
            label: 'Engagement Rate',
            sortable: true,
          },
          { key: 'growth', label: 'Growth', sortable: true },
        ],
      ),
      buildTopPostsBlock(data.topPosts),
    ],
    operation: DEFAULT_OPERATION,
    scope: 'organization',
    title: 'Organization Analytics',
  };
}

function buildBrandPreset(data: DashboardPresetData): DashboardBlockPreset {
  const analytics = data.analytics ?? {};
  const blocks: AgentUIBlock[] = [
    buildKpiGrid('brand-core-kpis', 'brand', analytics),
    buildChartBlock(
      'brand-platform-comparison',
      'Platform Comparison',
      data.platformComparisonData,
      'bar',
      'platform',
      [
        { key: 'views', label: 'Views' },
        { key: 'engagement', label: 'Engagement' },
        { key: 'posts', label: 'Posts' },
      ],
    ),
    buildChartBlock(
      'brand-timeseries',
      'Performance Trends',
      data.timeSeriesData,
      'line',
      'date',
      [
        { key: 'views', label: 'Views' },
        { key: 'engagementRate', label: 'Engagement Rate' },
      ],
    ),
    buildTopPostsBlock(data.topPosts),
  ];

  const activePlatforms = Array.isArray(analytics.activePlatforms)
    ? analytics.activePlatforms.length
    : 0;
  if (activePlatforms === 0) {
    blocks.push({
      id: 'brand-platform-alert',
      message:
        'No active platforms connected yet. Connect at least one channel for platform-level analytics.',
      severity: 'warning',
      title: 'Platform Connectivity',
      type: 'alert',
      width: 'full',
    });
  }

  return {
    blocks,
    operation: DEFAULT_OPERATION,
    scope: 'brand',
    title: 'Brand Analytics',
  };
}

function buildSuperAdminPreset(
  data: DashboardPresetData,
): DashboardBlockPreset {
  const analytics = data.analytics ?? {};

  const secondaryCards = pickSuperAdminSecondaryCards(analytics);
  const blocks: AgentUIBlock[] = [
    buildKpiGrid('superadmin-primary-kpis', 'superadmin', analytics),
  ];

  if (secondaryCards.length > 0) {
    blocks.push({
      cards: secondaryCards,
      columns: 3,
      id: 'superadmin-secondary-kpis',
      title: 'Operational KPIs',
      type: 'kpi_grid',
      width: 'full',
    });
  }

  const growthRows = [
    {
      metric: 'Monthly Growth',
      value: toNumber(analytics.monthlyGrowth),
    },
    {
      metric: 'Views Growth',
      value: toNumber(analytics.viewsGrowth),
    },
    {
      metric: 'Engagement Growth',
      value: toNumber(analytics.engagementGrowth),
    },
  ];

  blocks.push(
    buildChartBlock(
      'superadmin-growth',
      'Growth Trends',
      growthRows,
      'bar',
      'metric',
      [{ key: 'value', label: 'Growth %' }],
    ),
    buildTableBlock(
      'superadmin-organizations-table',
      'Top Organizations',
      data.organizationLeaderboard,
      [
        { key: 'organization.name', label: 'Organization', sortable: true },
        { key: 'totalPosts', label: 'Posts', sortable: true },
        { key: 'totalEngagement', label: 'Engagement', sortable: true },
        { key: 'avgEngagementRate', label: 'Engagement Rate', sortable: true },
        { key: 'growth', label: 'Growth', sortable: true },
      ],
    ),
    buildTableBlock(
      'superadmin-brands-table',
      'Top Brands',
      data.brandLeaderboard,
      [
        { key: 'name', label: 'Brand', sortable: true },
        { key: 'totalPosts', label: 'Posts', sortable: true },
        { key: 'totalEngagement', label: 'Engagement', sortable: true },
        { key: 'totalViews', label: 'Views', sortable: true },
        { key: 'growth', label: 'Growth', sortable: true },
      ],
    ),
  );

  return {
    blocks,
    operation: DEFAULT_OPERATION,
    scope: 'superadmin',
    title: 'Platform Analytics',
  };
}

export function getDashboardPreset(
  scope: DashboardScopePreset,
  data: DashboardPresetData,
): DashboardBlockPreset {
  if (scope === 'brand') {
    return buildBrandPreset(data);
  }
  if (scope === 'superadmin') {
    return buildSuperAdminPreset(data);
  }
  return buildOrganizationPreset(data);
}
