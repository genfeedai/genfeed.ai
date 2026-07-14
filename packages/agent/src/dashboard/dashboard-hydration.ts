import {
  type DashboardBlocksParseResult,
  type DashboardValidationIssue,
  parseAgentDashboardBlocks,
  parseDashboardOpenUIDocument,
} from '@genfeedai/agent/dashboard/dashboard-openui';
import { DASHBOARD_KPI_CATALOG } from '@genfeedai/agent/dashboard/dashboard-presets';
import type {
  AgentUIBlock,
  AgentUIBlockType,
  DashboardKpiDefinition,
  DashboardPresetData,
  IAnalytics,
  MetricCardBlock,
  PersistedDashboardLayoutDocument,
  TopPostItem,
} from '@genfeedai/interfaces';

const DASHBOARD_OPENUI_VERSION = 'genfeed.dashboard.openui.v1' as const;

/**
 * Live analytics bundle a persisted layout is hydrated against at render time.
 * Reuses the preset data shape so the same fetchers feed both surfaces.
 */
export type DashboardHydrationData = DashboardPresetData;

const KNOWN_METRIC_SOURCE_KEYS = new Set<string>(
  DASHBOARD_KPI_CATALOG.map((definition) => definition.key),
);
const KNOWN_CHART_SOURCE_KEYS = new Set<string>([
  'timeSeries',
  'platformComparison',
]);
const KNOWN_TABLE_SOURCE_KEYS = new Set<string>([
  'brandLeaderboard',
  'organizationLeaderboard',
  'platformComparison',
]);
const KNOWN_TOP_POSTS_SOURCE_KEYS = new Set<string>(['topPosts']);

const KPI_CATALOG_BY_KEY = new Map<string, DashboardKpiDefinition>(
  DASHBOARD_KPI_CATALOG.map((definition) => [definition.key, definition]),
);

/**
 * Phase-1 persistence coverage gate.
 *
 * `hydrateLayout` refills a persisted (snapshot-free) block from whatever
 * `DashboardHydrationData` the render call site supplies. Today the only
 * production call site — `WorkspaceOverviewContent`
 * (apps/app/app/(protected)/[orgSlug]/[brandSlug]/workspace/overview/content.tsx)
 * — builds its bundle as `{ analytics }` only; it does not fetch
 * `timeSeriesData`/`platformComparisonData`/`brandLeaderboard`/
 * `organizationLeaderboard`/`topPosts` (those live behind the separate
 * `analytics/trends` page's own hooks). `metric_card`/`kpi_grid` resolve
 * entirely from `analytics`, so they hydrate correctly. `chart`/`table`/
 * `top_posts` would resolve to `undefined` from `resolveCollection` forever
 * and keep their empty placeholder — a block that renders empty for the life
 * of the layout.
 *
 * Until the render call site is wired with those data sources, reject these
 * block types at persistence time (see `sanitizeBlock`) instead of silently
 * accepting a document that can never fully hydrate. Remove an entry here
 * once its data source is wired into `WorkspaceOverviewContent`'s bundle.
 */
const UNHYDRATABLE_PERSISTED_BLOCK_TYPES = new Set<AgentUIBlockType>([
  'chart',
  'table',
  'top_posts',
]);

export interface SanitizeLayoutResult {
  document: PersistedDashboardLayoutDocument;
  issues: DashboardValidationIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

/** Whether a data-bearing block's `sourceKey` resolves to a known live source. */
export function isResolvableSourceKey(
  type: AgentUIBlockType,
  sourceKey: string | undefined,
): boolean {
  if (!sourceKey) {
    return false;
  }
  switch (type) {
    case 'metric_card':
      return KNOWN_METRIC_SOURCE_KEYS.has(sourceKey);
    case 'chart':
      return KNOWN_CHART_SOURCE_KEYS.has(sourceKey);
    case 'table':
      return KNOWN_TABLE_SOURCE_KEYS.has(sourceKey);
    case 'top_posts':
      return KNOWN_TOP_POSTS_SOURCE_KEYS.has(sourceKey);
    default:
      return false;
  }
}

// ─── Persistence sanitization ────────────────────────────────────────────────

/**
 * Accept the flat `AgentUIBlock[]` array `render_dashboard` emits OR a full
 * OpenUI document (or our persisted `{ version, blocks }` wrapper) and route it
 * to the matching validator.
 */
function parseLayoutInput(input: unknown): DashboardBlocksParseResult {
  if (Array.isArray(input)) {
    return parseAgentDashboardBlocks(input);
  }
  if (isRecord(input)) {
    const blocks = input.blocks;
    if (Array.isArray(blocks)) {
      return parseAgentDashboardBlocks(blocks);
    }
    if ('components' in input || 'version' in input) {
      return parseDashboardOpenUIDocument(input);
    }
  }
  // Let the document parser emit the canonical `invalid_document` issue.
  return parseDashboardOpenUIDocument(input);
}

function sanitizeMetricCard(
  block: MetricCardBlock,
  path: string,
  issues: DashboardValidationIssue[],
): MetricCardBlock {
  if (!isResolvableSourceKey('metric_card', block.sourceKey)) {
    issues.push({
      code: 'invalid_props',
      message:
        'metric_card must reference a known analytics sourceKey (no embedded snapshots)',
      path: `${path}.sourceKey`,
    });
  }
  return { ...block, value: '' };
}

function sanitizeBlock(
  block: AgentUIBlock,
  path: string,
  issues: DashboardValidationIssue[],
): AgentUIBlock {
  switch (block.type) {
    case 'metric_card':
      return sanitizeMetricCard(block, path, issues);
    case 'kpi_grid':
      return {
        ...block,
        cards: block.cards.map((card, index) =>
          sanitizeMetricCard(card, `${path}.cards[${index}]`, issues),
        ),
      };
    case 'chart':
      if (
        UNHYDRATABLE_PERSISTED_BLOCK_TYPES.has('chart') ||
        !isResolvableSourceKey('chart', block.sourceKey)
      ) {
        issues.push({
          code: 'invalid_props',
          message: UNHYDRATABLE_PERSISTED_BLOCK_TYPES.has('chart')
            ? 'chart blocks cannot be persisted yet — the workspace overview render call site does not fetch time-series/platform-comparison data, so a saved chart would render empty forever'
            : 'chart must reference a known analytics sourceKey',
          path: `${path}.sourceKey`,
        });
      }
      return { ...block, data: [] };
    case 'table':
      if (
        UNHYDRATABLE_PERSISTED_BLOCK_TYPES.has('table') ||
        !isResolvableSourceKey('table', block.sourceKey)
      ) {
        issues.push({
          code: 'invalid_props',
          message: UNHYDRATABLE_PERSISTED_BLOCK_TYPES.has('table')
            ? 'table blocks cannot be persisted yet — the workspace overview render call site does not fetch leaderboard/platform-comparison data, so a saved table would render empty forever'
            : 'table must reference a known analytics sourceKey',
          path: `${path}.sourceKey`,
        });
      }
      return { ...block, rows: [] };
    case 'top_posts':
      if (
        UNHYDRATABLE_PERSISTED_BLOCK_TYPES.has('top_posts') ||
        !isResolvableSourceKey('top_posts', block.sourceKey)
      ) {
        issues.push({
          code: 'invalid_props',
          message: UNHYDRATABLE_PERSISTED_BLOCK_TYPES.has('top_posts')
            ? 'top_posts blocks cannot be persisted yet — the workspace overview render call site does not fetch top-post data, so a saved top_posts block would render empty forever'
            : 'top_posts must reference a known analytics sourceKey',
          path: `${path}.sourceKey`,
        });
      }
      return { ...block, posts: [] };
    case 'composite':
      return {
        ...block,
        blocks: block.blocks.map((child, index) =>
          sanitizeBlock(child, `${path}.blocks[${index}]`, issues),
        ),
      };
    default:
      // Presentational blocks (section_header/text/bullet_list/callout/alert/
      // image_grid/empty_state) are authored content — persisted verbatim.
      return block;
  }
}

/**
 * Validate an incoming layout and produce a snapshot-free persistence document.
 * Data-bearing blocks are required to carry a resolvable `sourceKey`; their
 * embedded live values are replaced with empty placeholders that
 * `hydrateLayout` refills at render time. Callers MUST reject when `issues` is
 * non-empty.
 */
export function sanitizeLayoutForPersistence(
  input: unknown,
): SanitizeLayoutResult {
  const parsed = parseLayoutInput(input);
  if (!parsed.isValid) {
    return {
      document: { blocks: parsed.blocks, version: DASHBOARD_OPENUI_VERSION },
      issues: parsed.issues,
    };
  }

  const issues: DashboardValidationIssue[] = [];
  const blocks = parsed.blocks.map((block, index) =>
    sanitizeBlock(block, `blocks[${index}]`, issues),
  );

  return {
    document: { blocks, version: DASHBOARD_OPENUI_VERSION },
    issues,
  };
}

// ─── Render-time hydration ───────────────────────────────────────────────────

function resolveMetricValue(
  sourceKey: string,
  analytics: Partial<IAnalytics>,
): string | number | undefined {
  const definition = KPI_CATALOG_BY_KEY.get(sourceKey);
  if (!definition) {
    return undefined;
  }

  let value: number | undefined;

  if (sourceKey === 'activePlatformsCount') {
    value = Array.isArray(analytics.activePlatforms)
      ? analytics.activePlatforms.length
      : undefined;
  } else if (sourceKey === 'avgViewsPerPost') {
    const posts = toFiniteNumber(analytics.totalPosts);
    const views = toFiniteNumber(analytics.totalViews);
    if (posts === 0) {
      value = 0;
    } else if (posts !== undefined && views !== undefined) {
      value = views / posts;
    }
  } else {
    value = toFiniteNumber(analytics[sourceKey as keyof IAnalytics]);

    if (value === undefined) {
      for (const fallbackKey of definition.fallbackKeys ?? []) {
        value = toFiniteNumber(analytics[fallbackKey]);
        if (value !== undefined) {
          break;
        }
      }
    }
  }

  if (value === undefined) {
    return undefined;
  }
  const format = definition?.format;
  if (format === 'percent') {
    return `${value.toFixed(2)}%`;
  }
  if (format === 'compact') {
    return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(
      value,
    );
  }
  return value;
}

function requireResolvableSourceKey(block: AgentUIBlock): string {
  const sourceKey = block.sourceKey;
  if (!isResolvableSourceKey(block.type, sourceKey)) {
    throw new Error(
      `Cannot hydrate dashboard ${block.type} block "${block.id}": unsupported sourceKey "${sourceKey ?? '<missing>'}"`,
    );
  }

  return sourceKey;
}

function throwMissingHydrationData(
  block: AgentUIBlock,
  sourceKey: string,
): never {
  throw new Error(
    `Cannot hydrate dashboard ${block.type} block "${block.id}": live data for sourceKey "${sourceKey}" was not provided`,
  );
}

function resolveCollection(
  sourceKey: string,
  bundle: DashboardHydrationData,
): Array<Record<string, unknown>> | undefined {
  switch (sourceKey) {
    case 'timeSeries':
      return bundle.timeSeriesData;
    case 'platformComparison':
      return bundle.platformComparisonData;
    case 'brandLeaderboard':
      return bundle.brandLeaderboard;
    case 'organizationLeaderboard':
      return bundle.organizationLeaderboard;
    case 'topPosts':
      return bundle.topPosts;
    default:
      return undefined;
  }
}

function toTopPostItem(
  row: Record<string, unknown>,
  index: number,
): TopPostItem {
  const id = typeof row.id === 'string' ? row.id : `post-${index}`;
  return {
    id,
    ...(typeof row.title === 'string' ? { title: row.title } : {}),
    ...(typeof row.thumbnail === 'string' ? { thumbnail: row.thumbnail } : {}),
    ...(typeof row.platform === 'string' ? { platform: row.platform } : {}),
    ...(toFiniteNumber(row.views) !== undefined
      ? { views: toFiniteNumber(row.views) }
      : {}),
    ...(toFiniteNumber(row.engagement) !== undefined
      ? { engagement: toFiniteNumber(row.engagement) }
      : {}),
    ...(typeof row.publishedAt === 'string'
      ? { publishedAt: row.publishedAt }
      : {}),
  };
}

function hydrateBlock(
  block: AgentUIBlock,
  bundle: DashboardHydrationData,
): AgentUIBlock {
  const analytics = bundle.analytics ?? {};
  const ready = { status: 'ready' as const };

  switch (block.type) {
    case 'metric_card': {
      const sourceKey = requireResolvableSourceKey(block);
      const value = resolveMetricValue(sourceKey, analytics);
      if (value === undefined) {
        return throwMissingHydrationData(block, sourceKey);
      }
      return { ...block, hydration: ready, value };
    }
    case 'kpi_grid':
      return {
        ...block,
        cards: block.cards.map(
          (card) => hydrateBlock(card, bundle) as MetricCardBlock,
        ),
      };
    case 'chart': {
      const sourceKey = requireResolvableSourceKey(block);
      const data = resolveCollection(sourceKey, bundle);
      if (data === undefined) {
        return throwMissingHydrationData(block, sourceKey);
      }
      return { ...block, data, hydration: ready };
    }
    case 'table': {
      const sourceKey = requireResolvableSourceKey(block);
      const rows = resolveCollection(sourceKey, bundle);
      if (rows === undefined) {
        return throwMissingHydrationData(block, sourceKey);
      }
      return { ...block, hydration: ready, rows };
    }
    case 'top_posts': {
      const sourceKey = requireResolvableSourceKey(block);
      const rows = resolveCollection(sourceKey, bundle);
      if (rows === undefined) {
        return throwMissingHydrationData(block, sourceKey);
      }
      return { ...block, hydration: ready, posts: rows.map(toTopPostItem) };
    }
    case 'composite':
      return {
        ...block,
        blocks: block.blocks.map((child) => hydrateBlock(child, bundle)),
      };
    default:
      return block;
  }
}

/**
 * Refill a persisted (snapshot-free) layout's data-bearing blocks from a live
 * analytics bundle. Unknown source keys and known keys whose live data was not
 * provided are rejected explicitly so persisted blocks cannot silently render
 * empty forever.
 */
export function hydrateLayout(
  input: PersistedDashboardLayoutDocument | unknown,
  bundle: DashboardHydrationData,
): AgentUIBlock[] {
  const parsed = parseLayoutInput(input);
  return parsed.blocks.map((block) => hydrateBlock(block, bundle));
}
