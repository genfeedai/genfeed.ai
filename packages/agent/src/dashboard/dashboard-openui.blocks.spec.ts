import {
  createUnsupportedDashboardTreeBlock,
  parseAgentDashboardBlocks,
  parseDashboardOpenUIDocument,
} from '@genfeedai/agent/dashboard/dashboard-openui';
import { describe, expect, it } from 'vitest';

describe('parseAgentDashboardBlocks block types', () => {
  it('accepts an empty input as a valid empty dashboard', () => {
    expect(parseAgentDashboardBlocks(undefined)).toEqual({
      blocks: [],
      issues: [],
      isValid: true,
    });
    expect(parseAgentDashboardBlocks(null).isValid).toBe(true);
  });

  it('rejects non-array input', () => {
    const result = parseAgentDashboardBlocks({ blocks: [] });

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.code).toBe('invalid_document');
  });

  it('rejects too many top-level blocks', () => {
    const blocks = Array.from({ length: 25 }, (_, index) => ({
      id: `m-${index}`,
      type: 'metric_card',
      value: index,
    }));

    const result = parseAgentDashboardBlocks(blocks);

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.code).toBe('too_many_blocks');
  });

  it('parses a metric card with trend, subtitle, icon, and color', () => {
    const result = parseAgentDashboardBlocks([
      {
        color: 'emerald',
        icon: 'eye',
        id: 'views',
        subtitle: 'Last 7 days',
        title: 'Views',
        trend: { direction: 'up', percentage: 12.5 },
        type: 'metric_card',
        value: 12400,
        width: 'half',
      },
    ]);

    expect(result.isValid).toBe(true);
    expect(result.blocks[0]).toMatchObject({
      color: 'emerald',
      icon: 'eye',
      subtitle: 'Last 7 days',
      trend: { direction: 'up', percentage: 12.5 },
      type: 'metric_card',
      value: 12400,
      width: 'half',
    });
  });

  it('rejects a metric card trend with negative percentage', () => {
    const result = parseAgentDashboardBlocks([
      {
        id: 'views',
        trend: { direction: 'down', percentage: -3 },
        type: 'metric_card',
        value: 1,
      },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.path).toBe('blocks[0].trend.percentage');
  });

  it('rejects a block without an id', () => {
    const result = parseAgentDashboardBlocks([
      { type: 'metric_card', value: 1 },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.path).toBe('blocks[0].id');
  });

  it('parses a chart block with series, axes, and toggles', () => {
    const result = parseAgentDashboardBlocks([
      {
        chartType: 'line',
        data: [
          { day: 'Mon', views: 10 },
          { day: 'Tue', views: 14 },
        ],
        height: 240,
        id: 'views-over-time',
        series: [{ color: '#22c55e', key: 'views', label: 'Views' }],
        showGrid: true,
        showLegend: false,
        type: 'chart',
        xAxis: 'day',
        yAxis: 'views',
      },
    ]);

    expect(result.isValid).toBe(true);
    expect(result.blocks[0]).toMatchObject({
      chartType: 'line',
      height: 240,
      series: [{ color: '#22c55e', key: 'views', label: 'Views' }],
      showGrid: true,
      showLegend: false,
      type: 'chart',
      xAxis: 'day',
      yAxis: 'views',
    });
  });

  it('rejects a chart without a chartType', () => {
    const result = parseAgentDashboardBlocks([
      { data: [], id: 'chart', type: 'chart' },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.path).toBe('blocks[0].chartType');
  });

  it('rejects chart series items without key and label', () => {
    const result = parseAgentDashboardBlocks([
      {
        chartType: 'bar',
        data: [],
        id: 'chart',
        series: [{ color: 'red' }],
        type: 'chart',
      },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.code).toBe('invalid_props');
  });

  it('parses a table block with columns, rows, and sorting', () => {
    const result = parseAgentDashboardBlocks([
      {
        columns: [
          { align: 'left', key: 'name', label: 'Name', sortable: true },
          { key: 'views', label: 'Views' },
        ],
        id: 'top-content',
        pageSize: 10,
        rows: [{ name: 'Post A', views: 120 }],
        sortBy: 'views',
        sortDirection: 'desc',
        type: 'table',
      },
    ]);

    expect(result.isValid).toBe(true);
    expect(result.blocks[0]).toMatchObject({
      pageSize: 10,
      sortBy: 'views',
      sortDirection: 'desc',
      type: 'table',
    });
  });

  it('rejects a table without columns', () => {
    const result = parseAgentDashboardBlocks([
      { columns: [], id: 'table', rows: [], type: 'table' },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.path).toBe('blocks[0].columns');
  });

  it('rejects table rows with non-primitive values', () => {
    const result = parseAgentDashboardBlocks([
      {
        columns: [{ key: 'name', label: 'Name' }],
        id: 'table',
        rows: [{ name: { nested: true } }],
        type: 'table',
      },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.code).toBe('invalid_props');
  });

  it('parses a top_posts block with post metadata', () => {
    const result = parseAgentDashboardBlocks([
      {
        id: 'top-posts',
        layout: 'grid',
        posts: [
          {
            engagement: 0.42,
            id: 'post-1',
            platform: 'instagram',
            publishedAt: '2026-03-01',
            thumbnail: 'https://cdn.example.com/a.png',
            title: 'Launch teaser',
            views: 1000,
          },
          { id: 'post-2' },
        ],
        type: 'top_posts',
      },
    ]);

    expect(result.isValid).toBe(true);
    expect(result.blocks[0]).toMatchObject({
      layout: 'grid',
      type: 'top_posts',
    });
    if (result.blocks[0]?.type !== 'top_posts') {
      throw new Error('Expected top posts block');
    }
    expect(result.blocks[0].posts).toHaveLength(2);
    expect(result.blocks[0].posts[0]).toMatchObject({
      engagement: 0.42,
      platform: 'instagram',
      views: 1000,
    });
  });

  it('rejects a top_posts post without an id', () => {
    const result = parseAgentDashboardBlocks([
      { id: 'top-posts', posts: [{ title: 'no id' }], type: 'top_posts' },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.path).toBe('blocks[0].posts[0].id');
  });

  it('parses an alert block', () => {
    const result = parseAgentDashboardBlocks([
      {
        dismissible: true,
        id: 'alert',
        message: 'Credits low',
        severity: 'warning',
        type: 'alert',
      },
    ]);

    expect(result.isValid).toBe(true);
    expect(result.blocks[0]).toMatchObject({
      dismissible: true,
      message: 'Credits low',
      severity: 'warning',
      type: 'alert',
    });
  });

  it('rejects an alert without a message', () => {
    const result = parseAgentDashboardBlocks([{ id: 'alert', type: 'alert' }]);

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.path).toBe('blocks[0].message');
  });

  it('parses a section header with a valid level', () => {
    const result = parseAgentDashboardBlocks([
      { id: 'header', level: 2, text: 'Performance', type: 'section_header' },
    ]);

    expect(result.isValid).toBe(true);
    expect(result.blocks[0]).toMatchObject({
      level: 2,
      text: 'Performance',
      type: 'section_header',
    });
  });

  it('rejects a section header with an invalid level', () => {
    const result = parseAgentDashboardBlocks([
      { id: 'header', level: 5, text: 'Nope', type: 'section_header' },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.path).toBe('blocks[0].level');
  });

  it('parses text paragraph, bullet list, callout blocks', () => {
    const result = parseAgentDashboardBlocks([
      { id: 'text', text: 'A short summary.', type: 'text_paragraph' },
      {
        id: 'list',
        items: ['First insight  ', 'Second insight'],
        ordered: true,
        type: 'bullet_list',
      },
      { id: 'callout', message: 'Ship it', tone: 'success', type: 'callout' },
    ]);

    expect(result.isValid).toBe(true);
    expect(result.blocks[0]).toMatchObject({ type: 'text_paragraph' });
    expect(result.blocks[1]).toMatchObject({
      items: ['First insight', 'Second insight'],
      ordered: true,
      type: 'bullet_list',
    });
    expect(result.blocks[2]).toMatchObject({
      tone: 'success',
      type: 'callout',
    });
  });

  it('rejects bullet list items that are not strings', () => {
    const result = parseAgentDashboardBlocks([
      { id: 'list', items: [42], type: 'bullet_list' },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.path).toBe('blocks[0].items[0]');
  });

  it('rejects empty bullet lists and retired block types', () => {
    expect(
      parseAgentDashboardBlocks([
        { id: 'list', items: [], type: 'bullet_list' },
      ]).isValid,
    ).toBe(false);
    expect(
      parseAgentDashboardBlocks([
        { id: 'retired', type: 'markdown', content: 'Retired format' },
      ]).isValid,
    ).toBe(false);
    expect(
      parseAgentDashboardBlocks([{ id: 'callout', type: 'callout' }]).isValid,
    ).toBe(false);
    expect(
      parseAgentDashboardBlocks([{ id: 'text', type: 'text_paragraph' }])
        .isValid,
    ).toBe(false);
    expect(
      parseAgentDashboardBlocks([{ id: 'header', type: 'section_header' }])
        .isValid,
    ).toBe(false);
  });

  it('parses an image grid with alt text and captions', () => {
    const result = parseAgentDashboardBlocks([
      {
        columns: 2,
        id: 'gallery',
        images: [
          {
            alt: 'Hero image',
            caption: 'Launch hero',
            url: 'https://cdn.example.com/hero.png',
          },
        ],
        type: 'image_grid',
      },
    ]);

    expect(result.isValid).toBe(true);
    expect(result.blocks[0]).toMatchObject({ columns: 2, type: 'image_grid' });
  });

  it('rejects empty image grids', () => {
    const result = parseAgentDashboardBlocks([
      { id: 'gallery', images: [], type: 'image_grid' },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.path).toBe('blocks[0].images');
  });

  it('parses a composite block with nested children', () => {
    const result = parseAgentDashboardBlocks([
      {
        blocks: [
          { id: 'inner-metric', type: 'metric_card', value: 5 },
          { id: 'inner-text', text: 'Nested', type: 'text_paragraph' },
        ],
        id: 'row-1',
        layout: 'row',
        type: 'composite',
      },
    ]);

    expect(result.isValid).toBe(true);
    if (result.blocks[0]?.type !== 'composite') {
      throw new Error('Expected composite block');
    }
    expect(result.blocks[0].blocks).toHaveLength(2);
    expect(result.blocks[0].layout).toBe('row');
  });

  it('rejects composites nested beyond the max depth', () => {
    const deepest = { id: 'metric', type: 'metric_card', value: 1 };
    const nested = {
      blocks: [
        {
          blocks: [
            {
              blocks: [{ blocks: [deepest], id: 'level-4', type: 'composite' }],
              id: 'level-3',
              type: 'composite',
            },
          ],
          id: 'level-2',
          type: 'composite',
        },
      ],
      id: 'level-1',
      type: 'composite',
    };

    const result = parseAgentDashboardBlocks([nested]);

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.code).toBe('max_depth_exceeded');
  });

  it('parses an empty_state block with CTA fields', () => {
    const result = parseAgentDashboardBlocks([
      {
        ctaAction: '/library',
        ctaLabel: 'Open library',
        icon: 'inbox',
        id: 'empty',
        message: 'Nothing here yet',
        type: 'empty_state',
      },
    ]);

    expect(result.isValid).toBe(true);
    expect(result.blocks[0]).toMatchObject({
      ctaAction: '/library',
      ctaLabel: 'Open library',
      message: 'Nothing here yet',
      type: 'empty_state',
    });
  });

  it('parses kpi_grid blocks with hydration and sourceKey metadata', () => {
    const result = parseAgentDashboardBlocks([
      {
        cards: [
          {
            hydration: { staggerMs: 200, status: 'loading' },
            id: 'views',
            sourceKey: 'analytics.views',
            sourceParams: { days: 7, platform: 'instagram' },
            value: 0,
          },
        ],
        columns: 3,
        id: 'kpis',
        type: 'kpi_grid',
      },
    ]);

    expect(result.isValid).toBe(true);
    if (result.blocks[0]?.type !== 'kpi_grid') {
      throw new Error('Expected KPI grid block');
    }
    expect(result.blocks[0].columns).toBe(3);
    expect(result.blocks[0].cards[0]).toMatchObject({
      hydration: { staggerMs: 200, status: 'loading' },
      sourceKey: 'analytics.views',
      sourceParams: { days: 7, platform: 'instagram' },
    });
  });

  it('rejects a kpi_grid without cards', () => {
    const result = parseAgentDashboardBlocks([
      { cards: [], id: 'kpis', type: 'kpi_grid' },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.path).toBe('blocks[0].cards');
  });

  it('rejects unknown block types', () => {
    const result = parseAgentDashboardBlocks([
      { id: 'mystery', type: 'iframe' },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.path).toBe('blocks[0].type');
  });
});

describe('createUnsupportedDashboardTreeBlock', () => {
  it('renders a generic message without an issue', () => {
    const block = createUnsupportedDashboardTreeBlock();

    expect(block.type).toBe('empty_state');
    expect(block.message).toContain('unsupported dashboard component tree');
  });

  it('includes the issue message and path when provided', () => {
    const block = createUnsupportedDashboardTreeBlock({
      code: 'invalid_props',
      message: 'value must be a number',
      path: 'blocks[0].value',
    });

    expect(block.message).toContain('value must be a number');
    expect(block.message).toContain('blocks[0].value');
  });
});

describe('parseDashboardOpenUIDocument components', () => {
  it('accepts a bare array of components', () => {
    const result = parseDashboardOpenUIDocument([
      {
        component: 'Dashboard.MetricCard',
        props: { id: 'views', value: 10 },
      },
    ]);

    expect(result.isValid).toBe(true);
    expect(result.blocks[0]).toMatchObject({ type: 'metric_card', value: 10 });
  });

  it('rejects a document with a wrong version', () => {
    const result = parseDashboardOpenUIDocument({
      components: [],
      version: 'genfeed.dashboard.openui.v999',
    });

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.path).toBe('document.version');
  });

  it('rejects a non-object document', () => {
    const result = parseDashboardOpenUIDocument('nope');

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.code).toBe('invalid_document');
  });

  it('maps every registered leaf component to its block type', () => {
    const result = parseDashboardOpenUIDocument({
      components: [
        {
          component: 'Dashboard.Chart',
          props: {
            chartType: 'area',
            data: [{ day: 'Mon', views: 4 }],
            id: 'chart',
          },
        },
        {
          component: 'Dashboard.Table',
          props: {
            columns: [{ key: 'name', label: 'Name' }],
            id: 'table',
            rows: [{ name: 'Post' }],
          },
        },
        {
          component: 'Dashboard.TopPosts',
          props: { id: 'top', posts: [{ id: 'post-1' }] },
        },
        {
          component: 'Dashboard.Alert',
          props: { id: 'alert', message: 'Heads up' },
        },
        {
          component: 'Dashboard.SectionHeader',
          props: { id: 'header', text: 'Section' },
        },
        {
          component: 'Dashboard.Text',
          props: { id: 'text', text: 'Body copy' },
        },
        {
          component: 'Dashboard.BulletList',
          props: { id: 'list', items: ['One'] },
        },
        {
          component: 'Dashboard.Callout',
          props: { id: 'callout', message: 'Note' },
        },
        {
          component: 'Dashboard.ImageGrid',
          props: { id: 'grid', images: [{ url: '/img.png' }] },
        },
        {
          component: 'Dashboard.EmptyState',
          props: { id: 'empty', message: 'Empty' },
        },
      ],
      version: 'genfeed.dashboard.openui.v1',
    });

    expect(result.isValid).toBe(true);
    expect(result.blocks.map((block) => block.type)).toEqual([
      'chart',
      'table',
      'top_posts',
      'alert',
      'section_header',
      'text_paragraph',
      'bullet_list',
      'callout',
      'image_grid',
      'empty_state',
    ]);
  });

  it('builds composite blocks from Dashboard.Stack children', () => {
    const result = parseDashboardOpenUIDocument({
      components: [
        {
          children: [
            {
              component: 'Dashboard.MetricCard',
              props: { id: 'child-metric', value: 3 },
            },
          ],
          component: 'Dashboard.Stack',
          props: { id: 'stack', layout: 'column' },
        },
      ],
      version: 'genfeed.dashboard.openui.v1',
    });

    expect(result.isValid).toBe(true);
    if (result.blocks[0]?.type !== 'composite') {
      throw new Error('Expected composite block');
    }
    expect(result.blocks[0].blocks[0]).toMatchObject({
      id: 'child-metric',
      type: 'metric_card',
    });
  });

  it('supports KpiGrid children as card nodes', () => {
    const result = parseDashboardOpenUIDocument({
      components: [
        {
          children: [
            {
              component: 'Dashboard.MetricCard',
              props: { id: 'kpi-child', value: 1 },
            },
          ],
          component: 'Dashboard.KpiGrid',
          props: { id: 'grid' },
        },
      ],
      version: 'genfeed.dashboard.openui.v1',
    });

    expect(result.isValid).toBe(true);
    if (result.blocks[0]?.type !== 'kpi_grid') {
      throw new Error('Expected KPI grid block');
    }
    expect(result.blocks[0].cards[0]).toMatchObject({ id: 'kpi-child' });
  });

  it('rejects nodes missing a component name', () => {
    const result = parseDashboardOpenUIDocument({
      components: [{ props: { id: 'x' } }],
      version: 'genfeed.dashboard.openui.v1',
    });

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.code).toBe('unsupported_component');
  });

  it('rejects non-object nodes inside components', () => {
    const result = parseDashboardOpenUIDocument({
      components: ['not-a-node'],
      version: 'genfeed.dashboard.openui.v1',
    });

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.code).toBe('invalid_document');
  });
});
