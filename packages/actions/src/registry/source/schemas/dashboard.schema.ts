import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  JSON_OBJECT_SCHEMA,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from '../../contracts/schema-builders';

export const DASHBOARD_BLOCK_REFERENCE = {
  $ref: '#/$defs/dashboardBlock',
} as const;
const trend = closedObjectSchema(
  { direction: enumSchema(['up', 'down', 'flat']), percentage: NUMBER_SCHEMA },
  ['direction', 'percentage'],
);
const baseProperties = {
  color: STRING_SCHEMA,
  hydration: closedObjectSchema({
    staggerMs: NUMBER_SCHEMA,
    status: enumSchema(['idle', 'loading', 'ready']),
  }),
  icon: STRING_SCHEMA,
  id: STRING_SCHEMA,
  sourceKey: STRING_SCHEMA,
  sourceParams: {
    additionalProperties: {
      anyOf: [STRING_SCHEMA, NUMBER_SCHEMA, BOOLEAN_SCHEMA, { type: 'null' }],
    },
    type: 'object',
  },
  subtitle: STRING_SCHEMA,
  title: STRING_SCHEMA,
  trend,
  value: { anyOf: [STRING_SCHEMA, NUMBER_SCHEMA] },
  width: enumSchema(['full', 'half', 'third']),
};
const metric = closedObjectSchema(
  { ...baseProperties, type: enumSchema(['metric_card']) },
  ['id', 'type'],
);
const block = closedObjectSchema(
  {
    ...baseProperties,
    blocks: arraySchema(DASHBOARD_BLOCK_REFERENCE),
    cards: arraySchema(metric),
    chartType: enumSchema(['area', 'bar', 'line', 'pie']),
    columns: {
      anyOf: [
        NUMBER_SCHEMA,
        arraySchema(
          closedObjectSchema(
            {
              align: enumSchema(['left', 'center', 'right']),
              key: STRING_SCHEMA,
              label: STRING_SCHEMA,
              sortable: BOOLEAN_SCHEMA,
            },
            ['key', 'label'],
          ),
        ),
      ],
    },
    ctaAction: STRING_SCHEMA,
    ctaLabel: STRING_SCHEMA,
    data: arraySchema(JSON_OBJECT_SCHEMA),
    dismissible: BOOLEAN_SCHEMA,
    height: NUMBER_SCHEMA,
    images: arraySchema(
      closedObjectSchema(
        { alt: STRING_SCHEMA, caption: STRING_SCHEMA, url: STRING_SCHEMA },
        ['url'],
      ),
    ),
    items: arraySchema(STRING_SCHEMA),
    layout: enumSchema(['row', 'column', 'grid', 'list']),
    level: { minimum: 1, maximum: 3, type: 'integer' },
    message: STRING_SCHEMA,
    ordered: BOOLEAN_SCHEMA,
    pageSize: NUMBER_SCHEMA,
    posts: arraySchema(
      closedObjectSchema(
        {
          engagement: NUMBER_SCHEMA,
          id: STRING_SCHEMA,
          platform: STRING_SCHEMA,
          publishedAt: STRING_SCHEMA,
          thumbnail: STRING_SCHEMA,
          title: STRING_SCHEMA,
          views: NUMBER_SCHEMA,
        },
        ['id'],
      ),
    ),
    rows: arraySchema(JSON_OBJECT_SCHEMA),
    series: arraySchema(
      closedObjectSchema(
        { color: STRING_SCHEMA, key: STRING_SCHEMA, label: STRING_SCHEMA },
        ['key', 'label'],
      ),
    ),
    severity: enumSchema(['info', 'warning', 'error', 'success']),
    showGrid: BOOLEAN_SCHEMA,
    showLegend: BOOLEAN_SCHEMA,
    sortBy: STRING_SCHEMA,
    sortDirection: enumSchema(['asc', 'desc']),
    text: STRING_SCHEMA,
    tone: enumSchema(['info', 'warning', 'error', 'success']),
    type: enumSchema([
      'metric_card',
      'kpi_grid',
      'chart',
      'table',
      'top_posts',
      'alert',
      'section_header',
      'text_paragraph',
      'bullet_list',
      'callout',
      'image_grid',
      'composite',
      'empty_state',
    ]),
    xAxis: STRING_SCHEMA,
    yAxis: STRING_SCHEMA,
  },
  ['id', 'type'],
);

const componentReference = { $ref: '#/$defs/dashboardComponent' } as const;
const component = closedObjectSchema(
  {
    component: enumSchema([
      'Dashboard.MetricCard',
      'Dashboard.KpiGrid',
      'Dashboard.Chart',
      'Dashboard.Table',
      'Dashboard.TopPosts',
      'Dashboard.Alert',
      'Dashboard.SectionHeader',
      'Dashboard.Text',
      'Dashboard.BulletList',
      'Dashboard.Callout',
      'Dashboard.ImageGrid',
      'Dashboard.EmptyState',
      'Dashboard.Stack',
    ]),
    props: JSON_OBJECT_SCHEMA,
    children: arraySchema(componentReference),
  },
  ['component'],
);
export const DASHBOARD_DEFINITIONS = {
  dashboardBlock: block,
  dashboardComponent: component,
};
export const DASHBOARD_DOCUMENT_SCHEMA = {
  anyOf: [
    closedObjectSchema(
      {
        blocks: arraySchema(DASHBOARD_BLOCK_REFERENCE),
        version: enumSchema(['genfeed.dashboard.openui.v1']),
      },
      ['blocks'],
    ),
    closedObjectSchema(
      {
        components: arraySchema(componentReference),
        version: enumSchema(['genfeed.dashboard.openui.v1']),
      },
      ['components'],
    ),
  ],
};
