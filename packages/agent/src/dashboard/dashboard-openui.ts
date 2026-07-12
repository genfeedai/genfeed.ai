import type {
  AgentAlertSeverity,
  AgentBlockSourceParams,
  AgentChartType,
  AgentTrendDirection,
  AgentUIBlock,
  AgentUIBlockType,
  AgentUIBlockWidth,
  AlertBlock,
  BulletListBlock,
  CalloutBlock,
  ChartBlock,
  ChartSeriesConfig,
  CompositeBlock,
  EmptyStateBlock,
  ImageGridBlock,
  ImageGridItem,
  KPIGridBlock,
  MarkdownBlock,
  MetricCardBlock,
  SectionHeaderBlock,
  TableBlock,
  TableColumnConfig,
  TextParagraphBlock,
  TopPostItem,
  TopPostsBlock,
} from '@genfeedai/interfaces';

const DASHBOARD_OPENUI_VERSION = 'genfeed.dashboard.openui.v1';
const MAX_TOP_LEVEL_BLOCKS = 24;
const MAX_CHILD_BLOCKS = 12;
const MAX_DEPTH = 3;
const MAX_TABLE_ROWS = 100;
const MAX_CHART_ROWS = 200;
const MAX_IMAGE_ITEMS = 24;

const BLOCK_TYPES = [
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
  'markdown',
  'image_grid',
  'composite',
  'empty_state',
] as const satisfies readonly AgentUIBlockType[];

const CHART_TYPES = ['area', 'bar', 'line', 'pie'] as const;
const WIDTHS = [
  'full',
  'half',
  'third',
] as const satisfies readonly AgentUIBlockWidth[];
const TREND_DIRECTIONS = [
  'up',
  'down',
  'flat',
] as const satisfies readonly AgentTrendDirection[];
const ALERT_SEVERITIES = [
  'info',
  'warning',
  'error',
  'success',
] as const satisfies readonly AgentAlertSeverity[];
const ALIGNMENTS = ['left', 'center', 'right'] as const;
const SORT_DIRECTIONS = ['asc', 'desc'] as const;
const HYDRATION_STATUSES = ['idle', 'loading', 'ready'] as const;

export const DASHBOARD_OPENUI_COMPONENTS = [
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
] as const;

export type DashboardOpenUIComponent =
  (typeof DASHBOARD_OPENUI_COMPONENTS)[number];

export type DashboardValidationIssueCode =
  | 'invalid_document'
  | 'invalid_props'
  | 'max_depth_exceeded'
  | 'too_many_blocks'
  | 'unsupported_block'
  | 'unsupported_component';

export type DashboardValidationIssue = {
  code: DashboardValidationIssueCode;
  message: string;
  path: string;
};

export type DashboardBlocksParseResult =
  | {
      blocks: AgentUIBlock[];
      issues: [];
      isValid: true;
    }
  | {
      blocks: AgentUIBlock[];
      issues: DashboardValidationIssue[];
      isValid: false;
    };

type DashboardPrimitive = boolean | number | string | null;
type DashboardRecord = Record<string, unknown>;
type FieldPath = string;

class DashboardValidationError extends Error {
  public readonly issue: DashboardValidationIssue;

  public constructor(issue: DashboardValidationIssue) {
    super(issue.message);
    this.issue = issue;
  }
}

function createIssue(
  code: DashboardValidationIssueCode,
  path: FieldPath,
  message: string,
): DashboardValidationIssue {
  return { code, message, path };
}

function fail(
  code: DashboardValidationIssueCode,
  path: FieldPath,
  message: string,
): never {
  throw new DashboardValidationError(createIssue(code, path, message));
}

function isRecord(value: unknown): value is DashboardRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): value is DashboardPrimitive {
  return (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  );
}

function readRecord(
  source: DashboardRecord,
  key: string,
  path: FieldPath,
  required = false,
): DashboardRecord | undefined {
  const value = source[key];
  if (value === undefined || value === null) {
    if (required) {
      fail('invalid_props', `${path}.${key}`, `${key} is required`);
    }
    return undefined;
  }
  if (!isRecord(value)) {
    fail('invalid_props', `${path}.${key}`, `${key} must be an object`);
  }
  return value;
}

function readString(
  source: DashboardRecord,
  key: string,
  path: FieldPath,
  options: { maxLength?: number; required?: boolean } = {},
): string | undefined {
  const value = source[key];
  if (value === undefined || value === null || value === '') {
    if (options.required) {
      fail('invalid_props', `${path}.${key}`, `${key} is required`);
    }
    return undefined;
  }
  if (typeof value !== 'string') {
    fail('invalid_props', `${path}.${key}`, `${key} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed && options.required) {
    fail('invalid_props', `${path}.${key}`, `${key} is required`);
  }
  return trimmed.slice(0, options.maxLength ?? 240);
}

function readBoolean(
  source: DashboardRecord,
  key: string,
  path: FieldPath,
): boolean | undefined {
  const value = source[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    fail('invalid_props', `${path}.${key}`, `${key} must be a boolean`);
  }
  return value;
}

function readNumber(
  source: DashboardRecord,
  key: string,
  path: FieldPath,
): number | undefined {
  const value = source[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('invalid_props', `${path}.${key}`, `${key} must be a finite number`);
  }
  return value;
}

function readInteger(
  source: DashboardRecord,
  key: string,
  path: FieldPath,
  options: { max: number; min: number },
): number | undefined {
  const value = readNumber(source, key, path);
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < options.min || value > options.max) {
    fail(
      'invalid_props',
      `${path}.${key}`,
      `${key} must be an integer from ${options.min} to ${options.max}`,
    );
  }
  return value;
}

function readEnum<T extends string>(
  source: DashboardRecord,
  key: string,
  path: FieldPath,
  allowed: readonly T[],
  required = false,
): T | undefined {
  const value = source[key];
  if (value === undefined || value === null || value === '') {
    if (required) {
      fail('invalid_props', `${path}.${key}`, `${key} is required`);
    }
    return undefined;
  }
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    fail(
      'invalid_props',
      `${path}.${key}`,
      `${key} must be one of: ${allowed.join(', ')}`,
    );
  }
  return value as T;
}

function readArray(
  source: DashboardRecord,
  key: string,
  path: FieldPath,
  options: { max: number; required?: boolean },
): unknown[] | undefined {
  const value = source[key];
  if (value === undefined || value === null) {
    if (options.required) {
      fail('invalid_props', `${path}.${key}`, `${key} is required`);
    }
    return undefined;
  }
  if (!Array.isArray(value)) {
    fail('invalid_props', `${path}.${key}`, `${key} must be an array`);
  }
  if (value.length > options.max) {
    fail(
      'too_many_blocks',
      `${path}.${key}`,
      `${key} must contain ${options.max} items or fewer`,
    );
  }
  return value;
}

function readValue(
  source: DashboardRecord,
  key: string,
  path: FieldPath,
): MetricCardBlock['value'] {
  const value = source[key];
  if (
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  fail('invalid_props', `${path}.${key}`, `${key} must be a string or number`);
}

function sanitizeRecord(
  value: unknown,
  path: FieldPath,
): Record<string, unknown> {
  if (!isRecord(value)) {
    fail('invalid_props', path, 'row must be an object');
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isPrimitive(entry)) {
      fail(
        'invalid_props',
        `${path}.${key}`,
        'row values must be strings, numbers, booleans, or null',
      );
    }
    sanitized[key] = entry;
  }
  return sanitized;
}

function readPrimitiveRecordArray(
  source: DashboardRecord,
  key: string,
  path: FieldPath,
  max: number,
): Record<string, unknown>[] {
  const rows = readArray(source, key, path, { max, required: true }) ?? [];
  return rows.map((row, index) =>
    sanitizeRecord(row, `${path}.${key}[${index}]`),
  );
}

function parseHydration(source: DashboardRecord, path: FieldPath) {
  const hydration = readRecord(source, 'hydration', path);
  if (!hydration) {
    return undefined;
  }
  const staggerMs = readInteger(hydration, 'staggerMs', `${path}.hydration`, {
    max: 5000,
    min: 0,
  });
  const status = readEnum(
    hydration,
    'status',
    `${path}.hydration`,
    HYDRATION_STATUSES,
  );
  return {
    ...(staggerMs !== undefined ? { staggerMs } : {}),
    ...(status ? { status } : {}),
  };
}

function parseSourceParams(
  source: DashboardRecord,
  path: FieldPath,
): AgentBlockSourceParams | undefined {
  const record = readRecord(source, 'sourceParams', path);
  if (!record) {
    return undefined;
  }
  // sanitizeRecord guarantees every value is a string, number, boolean, or null,
  // which is exactly AgentBlockSourceParams — the cast narrows the `unknown`
  // values back to that validated union.
  return sanitizeRecord(
    record,
    `${path}.sourceParams`,
  ) as AgentBlockSourceParams;
}

function parseBaseBlock(source: DashboardRecord, path: FieldPath) {
  const id = readString(source, 'id', path, {
    maxLength: 96,
    required: true,
  });
  if (!id) {
    fail('invalid_props', `${path}.id`, 'id is required');
  }
  const title = readString(source, 'title', path, { maxLength: 160 });
  const width = readEnum(source, 'width', path, WIDTHS);
  const hydration = parseHydration(source, path);
  const sourceKey = readString(source, 'sourceKey', path, { maxLength: 96 });
  const sourceParams = parseSourceParams(source, path);
  return {
    ...(hydration ? { hydration } : {}),
    id,
    ...(title ? { title } : {}),
    ...(width ? { width } : {}),
    ...(sourceKey ? { sourceKey } : {}),
    ...(sourceParams ? { sourceParams } : {}),
  };
}

function parseTrend(source: DashboardRecord, path: FieldPath) {
  const trend = readRecord(source, 'trend', path);
  if (!trend) {
    return undefined;
  }
  const direction = readEnum(
    trend,
    'direction',
    `${path}.trend`,
    TREND_DIRECTIONS,
    true,
  );
  const percentage = readNumber(trend, 'percentage', `${path}.trend`);
  if (!direction || percentage === undefined || percentage < 0) {
    fail(
      'invalid_props',
      `${path}.trend.percentage`,
      'trend percentage must be a non-negative number',
    );
  }
  return { direction, percentage };
}

function parseMetricCard(
  source: DashboardRecord,
  path: FieldPath,
): MetricCardBlock {
  const base = parseBaseBlock(source, path);
  const subtitle = readString(source, 'subtitle', path, { maxLength: 240 });
  const icon = readString(source, 'icon', path, { maxLength: 40 });
  const color = readString(source, 'color', path, { maxLength: 40 });
  const trend = parseTrend(source, path);
  return {
    ...base,
    ...(color ? { color } : {}),
    ...(icon ? { icon } : {}),
    ...(subtitle ? { subtitle } : {}),
    ...(trend ? { trend } : {}),
    type: 'metric_card',
    value: readValue(source, 'value', path),
  };
}

function parseKpiGrid(source: DashboardRecord, path: FieldPath): KPIGridBlock {
  const cards = readArray(source, 'cards', path, {
    max: MAX_CHILD_BLOCKS,
    required: true,
  });
  if (!cards || cards.length === 0) {
    fail(
      'invalid_props',
      `${path}.cards`,
      'cards must contain at least one card',
    );
  }
  const columns = readInteger(source, 'columns', path, { max: 4, min: 1 });
  return {
    ...parseBaseBlock(source, path),
    cards: cards.map((card, index) => {
      if (!isRecord(card)) {
        fail(
          'invalid_props',
          `${path}.cards[${index}]`,
          'card must be an object',
        );
      }
      return parseMetricCard(
        { ...card, type: 'metric_card' },
        `${path}.cards[${index}]`,
      );
    }),
    ...(columns !== undefined ? { columns } : {}),
    type: 'kpi_grid',
  };
}

function parseSeries(source: DashboardRecord, path: FieldPath) {
  const series = readArray(source, 'series', path, { max: 8 });
  if (!series) {
    return undefined;
  }
  return series.map((item, index): ChartSeriesConfig => {
    if (!isRecord(item)) {
      fail(
        'invalid_props',
        `${path}.series[${index}]`,
        'series item must be an object',
      );
    }
    const itemPath = `${path}.series[${index}]`;
    const key = readString(item, 'key', itemPath, {
      maxLength: 80,
      required: true,
    });
    const label = readString(item, 'label', itemPath, {
      maxLength: 120,
      required: true,
    });
    const color = readString(item, 'color', itemPath, { maxLength: 40 });
    if (!key || !label) {
      fail('invalid_props', itemPath, 'series item requires key and label');
    }
    return { key, label, ...(color ? { color } : {}) };
  });
}

function parseChart(source: DashboardRecord, path: FieldPath): ChartBlock {
  const chartType = readEnum(source, 'chartType', path, CHART_TYPES, true) as
    | AgentChartType
    | undefined;
  if (!chartType) {
    fail('invalid_props', `${path}.chartType`, 'chartType is required');
  }
  const height = readInteger(source, 'height', path, { max: 520, min: 120 });
  const series = parseSeries(source, path);
  const showGrid = readBoolean(source, 'showGrid', path);
  const showLegend = readBoolean(source, 'showLegend', path);
  const xAxis = readString(source, 'xAxis', path, { maxLength: 80 });
  const yAxis = readString(source, 'yAxis', path, { maxLength: 80 });
  return {
    ...parseBaseBlock(source, path),
    chartType,
    data: readPrimitiveRecordArray(source, 'data', path, MAX_CHART_ROWS),
    ...(height !== undefined ? { height } : {}),
    ...(series ? { series } : {}),
    ...(showGrid !== undefined ? { showGrid } : {}),
    ...(showLegend !== undefined ? { showLegend } : {}),
    type: 'chart',
    ...(xAxis ? { xAxis } : {}),
    ...(yAxis ? { yAxis } : {}),
  };
}

function parseColumns(source: DashboardRecord, path: FieldPath) {
  const columns = readArray(source, 'columns', path, {
    max: 12,
    required: true,
  });
  if (!columns || columns.length === 0) {
    fail(
      'invalid_props',
      `${path}.columns`,
      'columns must contain at least one column',
    );
  }
  return columns.map((item, index): TableColumnConfig => {
    if (!isRecord(item)) {
      fail(
        'invalid_props',
        `${path}.columns[${index}]`,
        'column must be an object',
      );
    }
    const itemPath = `${path}.columns[${index}]`;
    const key = readString(item, 'key', itemPath, {
      maxLength: 80,
      required: true,
    });
    const label = readString(item, 'label', itemPath, {
      maxLength: 120,
      required: true,
    });
    if (!key || !label) {
      fail('invalid_props', itemPath, 'column requires key and label');
    }
    const align = readEnum(item, 'align', itemPath, ALIGNMENTS);
    const sortable = readBoolean(item, 'sortable', itemPath);
    return {
      ...(align ? { align } : {}),
      key,
      label,
      ...(sortable !== undefined ? { sortable } : {}),
    };
  });
}

function parseTable(source: DashboardRecord, path: FieldPath): TableBlock {
  const pageSize = readInteger(source, 'pageSize', path, { max: 100, min: 1 });
  const sortBy = readString(source, 'sortBy', path, { maxLength: 80 });
  const sortDirection = readEnum(
    source,
    'sortDirection',
    path,
    SORT_DIRECTIONS,
  );
  return {
    ...parseBaseBlock(source, path),
    columns: parseColumns(source, path),
    ...(pageSize !== undefined ? { pageSize } : {}),
    rows: readPrimitiveRecordArray(source, 'rows', path, MAX_TABLE_ROWS),
    ...(sortBy ? { sortBy } : {}),
    ...(sortDirection ? { sortDirection } : {}),
    type: 'table',
  };
}

function parseTopPosts(
  source: DashboardRecord,
  path: FieldPath,
): TopPostsBlock {
  const posts = readArray(source, 'posts', path, {
    max: MAX_CHILD_BLOCKS,
    required: true,
  });
  if (!posts) {
    fail('invalid_props', `${path}.posts`, 'posts are required');
  }
  const layout = readEnum(source, 'layout', path, ['grid', 'list'] as const);
  return {
    ...parseBaseBlock(source, path),
    ...(layout ? { layout } : {}),
    posts: posts.map((post, index): TopPostItem => {
      if (!isRecord(post)) {
        fail(
          'invalid_props',
          `${path}.posts[${index}]`,
          'post must be an object',
        );
      }
      const itemPath = `${path}.posts[${index}]`;
      const id = readString(post, 'id', itemPath, {
        maxLength: 96,
        required: true,
      });
      if (!id) {
        fail('invalid_props', `${itemPath}.id`, 'post id is required');
      }
      const engagement = readNumber(post, 'engagement', itemPath);
      const platform = readString(post, 'platform', itemPath, {
        maxLength: 80,
      });
      const publishedAt = readString(post, 'publishedAt', itemPath, {
        maxLength: 80,
      });
      const thumbnail = readSafeUrl(post, 'thumbnail', itemPath);
      const title = readString(post, 'title', itemPath, { maxLength: 180 });
      const views = readNumber(post, 'views', itemPath);
      return {
        ...(engagement !== undefined ? { engagement } : {}),
        id,
        ...(platform ? { platform } : {}),
        ...(publishedAt ? { publishedAt } : {}),
        ...(thumbnail ? { thumbnail } : {}),
        ...(title ? { title } : {}),
        ...(views !== undefined ? { views } : {}),
      };
    }),
    type: 'top_posts',
  };
}

function parseAlert(source: DashboardRecord, path: FieldPath): AlertBlock {
  const message = readString(source, 'message', path, {
    maxLength: 500,
    required: true,
  });
  if (!message) {
    fail('invalid_props', `${path}.message`, 'message is required');
  }
  const dismissible = readBoolean(source, 'dismissible', path);
  const severity = readEnum(source, 'severity', path, ALERT_SEVERITIES);
  return {
    ...parseBaseBlock(source, path),
    ...(dismissible !== undefined ? { dismissible } : {}),
    message,
    ...(severity ? { severity } : {}),
    type: 'alert',
  };
}

function readSectionLevel(
  source: DashboardRecord,
  path: FieldPath,
): 1 | 2 | 3 | undefined {
  const level = source.level;
  if (level === undefined || level === null) {
    return undefined;
  }
  if (level !== 1 && level !== 2 && level !== 3) {
    fail('invalid_props', `${path}.level`, 'level must be 1, 2, or 3');
  }
  return level;
}

function parseSectionHeader(
  source: DashboardRecord,
  path: FieldPath,
): SectionHeaderBlock {
  const text = readString(source, 'text', path, {
    maxLength: 200,
    required: true,
  });
  if (!text) {
    fail('invalid_props', `${path}.text`, 'text is required');
  }
  const level = readSectionLevel(source, path);
  return {
    ...parseBaseBlock(source, path),
    ...(level ? { level } : {}),
    text,
    type: 'section_header',
  };
}

function parseTextParagraph(
  source: DashboardRecord,
  path: FieldPath,
): TextParagraphBlock {
  const text = readString(source, 'text', path, {
    maxLength: 1200,
    required: true,
  });
  if (!text) {
    fail('invalid_props', `${path}.text`, 'text is required');
  }
  return { ...parseBaseBlock(source, path), text, type: 'text_paragraph' };
}

function parseBulletList(
  source: DashboardRecord,
  path: FieldPath,
): BulletListBlock {
  const items = readArray(source, 'items', path, {
    max: MAX_CHILD_BLOCKS,
    required: true,
  });
  if (!items || items.length === 0) {
    fail(
      'invalid_props',
      `${path}.items`,
      'items must contain at least one item',
    );
  }
  const ordered = readBoolean(source, 'ordered', path);
  return {
    ...parseBaseBlock(source, path),
    items: items.map((item, index) => {
      if (typeof item !== 'string' || item.trim() === '') {
        fail(
          'invalid_props',
          `${path}.items[${index}]`,
          'item must be a string',
        );
      }
      return item.trim().slice(0, 240);
    }),
    ...(ordered !== undefined ? { ordered } : {}),
    type: 'bullet_list',
  };
}

function parseCallout(source: DashboardRecord, path: FieldPath): CalloutBlock {
  const message = readString(source, 'message', path, {
    maxLength: 500,
    required: true,
  });
  if (!message) {
    fail('invalid_props', `${path}.message`, 'message is required');
  }
  const tone = readEnum(source, 'tone', path, ALERT_SEVERITIES);
  return {
    ...parseBaseBlock(source, path),
    message,
    ...(tone ? { tone } : {}),
    type: 'callout',
  };
}

function parseMarkdown(
  source: DashboardRecord,
  path: FieldPath,
): MarkdownBlock {
  const content = readString(source, 'content', path, {
    maxLength: 4000,
    required: true,
  });
  if (!content) {
    fail('invalid_props', `${path}.content`, 'content is required');
  }
  return { ...parseBaseBlock(source, path), content, type: 'markdown' };
}

function isSafeUrl(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith('https://') ||
    normalized.startsWith('http://') ||
    // Protocol-relative `//host/...` resolves to an external origin, so only
    // single-slash same-origin paths count as relative.
    (normalized.startsWith('/') && !normalized.startsWith('//'))
  );
}

function readSafeUrl(
  source: DashboardRecord,
  key: string,
  path: FieldPath,
  required = false,
): string | undefined {
  const value = readString(source, key, path, {
    maxLength: 1000,
    required,
  });
  if (!value) {
    return undefined;
  }
  if (!isSafeUrl(value)) {
    fail(
      'invalid_props',
      `${path}.${key}`,
      `${key} must be an http(s) or relative URL`,
    );
  }
  return value;
}

function parseImageGrid(
  source: DashboardRecord,
  path: FieldPath,
): ImageGridBlock {
  const images = readArray(source, 'images', path, {
    max: MAX_IMAGE_ITEMS,
    required: true,
  });
  if (!images || images.length === 0) {
    fail(
      'invalid_props',
      `${path}.images`,
      'images must contain at least one image',
    );
  }
  const columns = readInteger(source, 'columns', path, { max: 4, min: 1 });
  return {
    ...parseBaseBlock(source, path),
    ...(columns !== undefined ? { columns } : {}),
    images: images.map((image, index): ImageGridItem => {
      if (!isRecord(image)) {
        fail(
          'invalid_props',
          `${path}.images[${index}]`,
          'image must be an object',
        );
      }
      const itemPath = `${path}.images[${index}]`;
      const url = readSafeUrl(image, 'url', itemPath, true);
      if (!url) {
        fail('invalid_props', `${itemPath}.url`, 'image url is required');
      }
      const alt = readString(image, 'alt', itemPath, { maxLength: 180 });
      const caption = readString(image, 'caption', itemPath, {
        maxLength: 240,
      });
      return {
        ...(alt ? { alt } : {}),
        ...(caption ? { caption } : {}),
        url,
      };
    }),
    type: 'image_grid',
  };
}

function parseComposite(
  source: DashboardRecord,
  path: FieldPath,
  depth: number,
): CompositeBlock {
  if (depth >= MAX_DEPTH) {
    fail(
      'max_depth_exceeded',
      path,
      'dashboard component tree is too deeply nested',
    );
  }
  const blocks = readArray(source, 'blocks', path, {
    max: MAX_CHILD_BLOCKS,
    required: true,
  });
  if (!blocks || blocks.length === 0) {
    fail(
      'invalid_props',
      `${path}.blocks`,
      'blocks must contain at least one block',
    );
  }
  const layout = readEnum(source, 'layout', path, ['row', 'column'] as const);
  return {
    ...parseBaseBlock(source, path),
    blocks: blocks.map((block, index) =>
      parseAgentDashboardBlock(block, `${path}.blocks[${index}]`, depth + 1),
    ),
    ...(layout ? { layout } : {}),
    type: 'composite',
  };
}

function parseEmptyState(
  source: DashboardRecord,
  path: FieldPath,
): EmptyStateBlock {
  const message = readString(source, 'message', path, {
    maxLength: 500,
    required: true,
  });
  if (!message) {
    fail('invalid_props', `${path}.message`, 'message is required');
  }
  const ctaAction = readString(source, 'ctaAction', path, { maxLength: 160 });
  const ctaLabel = readString(source, 'ctaLabel', path, { maxLength: 80 });
  const icon = readString(source, 'icon', path, { maxLength: 40 });
  return {
    ...parseBaseBlock(source, path),
    ...(ctaAction ? { ctaAction } : {}),
    ...(ctaLabel ? { ctaLabel } : {}),
    ...(icon ? { icon } : {}),
    message,
    type: 'empty_state',
  };
}

function parseAgentDashboardBlock(
  input: unknown,
  path: FieldPath,
  depth: number,
): AgentUIBlock {
  if (!isRecord(input)) {
    fail('invalid_document', path, 'dashboard block must be an object');
  }
  const type = readEnum(input, 'type', path, BLOCK_TYPES, true);
  switch (type) {
    case 'metric_card':
      return parseMetricCard(input, path);
    case 'kpi_grid':
      return parseKpiGrid(input, path);
    case 'chart':
      return parseChart(input, path);
    case 'table':
      return parseTable(input, path);
    case 'top_posts':
      return parseTopPosts(input, path);
    case 'alert':
      return parseAlert(input, path);
    case 'section_header':
      return parseSectionHeader(input, path);
    case 'text_paragraph':
      return parseTextParagraph(input, path);
    case 'bullet_list':
      return parseBulletList(input, path);
    case 'callout':
      return parseCallout(input, path);
    case 'markdown':
      return parseMarkdown(input, path);
    case 'image_grid':
      return parseImageGrid(input, path);
    case 'composite':
      return parseComposite(input, path, depth);
    case 'empty_state':
      return parseEmptyState(input, path);
    default:
      fail(
        'unsupported_block',
        `${path}.type`,
        'unsupported dashboard block type',
      );
  }
}

export function createUnsupportedDashboardTreeBlock(
  issue?: DashboardValidationIssue,
): EmptyStateBlock {
  return {
    icon: '!',
    id: 'dashboard-renderer-unsupported-tree',
    message: issue
      ? `${issue.message} at ${issue.path}. The dashboard was not rendered.`
      : 'The agent returned an unsupported dashboard component tree. The dashboard was not rendered.',
    title: 'Unsupported dashboard output',
    type: 'empty_state',
    width: 'full',
  };
}

function rejectedResult(
  issue: DashboardValidationIssue,
): DashboardBlocksParseResult {
  return {
    blocks: [createUnsupportedDashboardTreeBlock(issue)],
    issues: [issue],
    isValid: false,
  };
}

export function parseAgentDashboardBlocks(
  input: unknown,
): DashboardBlocksParseResult {
  try {
    if (input === undefined || input === null) {
      return { blocks: [], issues: [], isValid: true };
    }
    if (!Array.isArray(input)) {
      fail('invalid_document', 'blocks', 'dashboard blocks must be an array');
    }
    if (input.length > MAX_TOP_LEVEL_BLOCKS) {
      fail(
        'too_many_blocks',
        'blocks',
        `dashboard blocks must contain ${MAX_TOP_LEVEL_BLOCKS} items or fewer`,
      );
    }
    return {
      blocks: input.map((block, index) =>
        parseAgentDashboardBlock(block, `blocks[${index}]`, 0),
      ),
      issues: [],
      isValid: true,
    };
  } catch (error) {
    if (error instanceof DashboardValidationError) {
      return rejectedResult(error.issue);
    }
    return rejectedResult(
      createIssue(
        'invalid_document',
        'blocks',
        'dashboard blocks could not be parsed',
      ),
    );
  }
}

function parseOpenUIComponents(input: unknown): unknown[] {
  if (Array.isArray(input)) {
    return input;
  }
  if (!isRecord(input)) {
    fail('invalid_document', 'document', 'OpenUI document must be an object');
  }
  const version = readString(input, 'version', 'document', { maxLength: 80 });
  if (version && version !== DASHBOARD_OPENUI_VERSION) {
    fail(
      'invalid_document',
      'document.version',
      `OpenUI dashboard version must be ${DASHBOARD_OPENUI_VERSION}`,
    );
  }
  return (
    readArray(input, 'components', 'document', {
      max: MAX_TOP_LEVEL_BLOCKS,
      required: true,
    }) ?? []
  );
}

function readOpenUIProps(
  node: DashboardRecord,
  path: FieldPath,
): DashboardRecord {
  return readRecord(node, 'props', path) ?? {};
}

function readOpenUIComponent(
  node: DashboardRecord,
  path: FieldPath,
): DashboardOpenUIComponent {
  const value = node.component;
  if (typeof value !== 'string' || value.trim() === '') {
    fail('unsupported_component', `${path}.component`, 'component is required');
  }
  const component = value.trim();
  if (
    !DASHBOARD_OPENUI_COMPONENTS.includes(component as DashboardOpenUIComponent)
  ) {
    const displayComponent = component.slice(0, 120);
    fail(
      'unsupported_component',
      `${path}.component`,
      `${displayComponent} is not a registered dashboard component`,
    );
  }
  return component as DashboardOpenUIComponent;
}

function createBlockFromOpenUI(
  component: DashboardOpenUIComponent,
  props: DashboardRecord,
  path: FieldPath,
  node: DashboardRecord,
  depth: number,
): AgentUIBlock {
  switch (component) {
    case 'Dashboard.MetricCard':
      return parseMetricCard(
        { ...props, type: 'metric_card' },
        `${path}.props`,
      );
    case 'Dashboard.KpiGrid': {
      const cards =
        readArray(props, 'cards', `${path}.props`, { max: MAX_CHILD_BLOCKS }) ??
        readArray(node, 'children', path, {
          max: MAX_CHILD_BLOCKS,
          required: true,
        });
      return parseKpiGrid(
        {
          ...props,
          cards: cards?.map((card, index) =>
            parseOpenUINode(card, `${path}.cards[${index}]`, depth + 1),
          ),
          type: 'kpi_grid',
        },
        `${path}.props`,
      );
    }
    case 'Dashboard.Chart':
      return parseChart({ ...props, type: 'chart' }, `${path}.props`);
    case 'Dashboard.Table':
      return parseTable({ ...props, type: 'table' }, `${path}.props`);
    case 'Dashboard.TopPosts':
      return parseTopPosts({ ...props, type: 'top_posts' }, `${path}.props`);
    case 'Dashboard.Alert':
      return parseAlert({ ...props, type: 'alert' }, `${path}.props`);
    case 'Dashboard.SectionHeader':
      return parseSectionHeader(
        { ...props, type: 'section_header' },
        `${path}.props`,
      );
    case 'Dashboard.Text':
      return parseTextParagraph(
        { ...props, type: 'text_paragraph' },
        `${path}.props`,
      );
    case 'Dashboard.BulletList':
      return parseBulletList(
        { ...props, type: 'bullet_list' },
        `${path}.props`,
      );
    case 'Dashboard.Callout':
      return parseCallout({ ...props, type: 'callout' }, `${path}.props`);
    case 'Dashboard.ImageGrid':
      return parseImageGrid({ ...props, type: 'image_grid' }, `${path}.props`);
    case 'Dashboard.EmptyState':
      return parseEmptyState(
        { ...props, type: 'empty_state' },
        `${path}.props`,
      );
    case 'Dashboard.Stack': {
      const children = readArray(node, 'children', path, {
        max: MAX_CHILD_BLOCKS,
        required: true,
      });
      return parseComposite(
        {
          ...props,
          blocks: children?.map((child, index) =>
            parseOpenUINode(child, `${path}.children[${index}]`, depth + 1),
          ),
          type: 'composite',
        },
        `${path}.props`,
        depth,
      );
    }
  }
}

function parseOpenUINode(
  input: unknown,
  path: FieldPath,
  depth: number,
): AgentUIBlock {
  if (depth > MAX_DEPTH) {
    fail(
      'max_depth_exceeded',
      path,
      'dashboard OpenUI tree is too deeply nested',
    );
  }
  if (!isRecord(input)) {
    fail('invalid_document', path, 'OpenUI node must be an object');
  }
  const component = readOpenUIComponent(input, path);
  const props = readOpenUIProps(input, path);
  return createBlockFromOpenUI(component, props, path, input, depth);
}

export function parseDashboardOpenUIDocument(
  input: unknown,
): DashboardBlocksParseResult {
  try {
    const components = parseOpenUIComponents(input);
    if (components.length > MAX_TOP_LEVEL_BLOCKS) {
      fail(
        'too_many_blocks',
        'document.components',
        `OpenUI dashboard must contain ${MAX_TOP_LEVEL_BLOCKS} components or fewer`,
      );
    }
    return {
      blocks: components.map((component, index) =>
        parseOpenUINode(component, `components[${index}]`, 0),
      ),
      issues: [],
      isValid: true,
    };
  } catch (error) {
    if (error instanceof DashboardValidationError) {
      return rejectedResult(error.issue);
    }
    return rejectedResult(
      createIssue(
        'invalid_document',
        'document',
        'OpenUI dashboard document could not be parsed',
      ),
    );
  }
}
