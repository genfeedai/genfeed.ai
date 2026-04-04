export type AgentUIBlockWidth = 'full' | 'half' | 'third';

export type AgentUIBlockType =
  | 'metric_card'
  | 'kpi_grid'
  | 'chart'
  | 'table'
  | 'top_posts'
  | 'alert'
  | 'section_header'
  | 'text_paragraph'
  | 'bullet_list'
  | 'callout'
  | 'markdown'
  | 'image_grid'
  | 'composite'
  | 'empty_state';

export type AgentChartType = 'area' | 'bar' | 'line' | 'pie' | 'funnel';

export type AgentTrendDirection = 'up' | 'down' | 'flat';

export interface AgentBlockTrend {
  direction: AgentTrendDirection;
  percentage: number;
}

interface BaseBlock {
  id: string;
  type: AgentUIBlockType;
  title?: string;
  width?: AgentUIBlockWidth;
}

export interface MetricCardBlock extends BaseBlock {
  type: 'metric_card';
  value: string | number;
  subtitle?: string;
  trend?: AgentBlockTrend;
  icon?: string;
  color?: string;
}

export interface KPIGridBlock extends BaseBlock {
  type: 'kpi_grid';
  columns?: number;
  cards: MetricCardBlock[];
}

export interface ChartSeriesConfig {
  key: string;
  label: string;
  color?: string;
}

export interface ChartBlock extends BaseBlock {
  type: 'chart';
  chartType: AgentChartType;
  data: Record<string, unknown>[];
  xAxis?: string;
  yAxis?: string;
  series?: ChartSeriesConfig[];
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
}

export interface TableColumnConfig {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface TableBlock extends BaseBlock {
  type: 'table';
  columns: TableColumnConfig[];
  rows: Record<string, unknown>[];
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  pageSize?: number;
}

export interface TopPostItem {
  id: string;
  title?: string;
  thumbnail?: string;
  platform?: string;
  views?: number;
  engagement?: number;
  publishedAt?: string;
}

export interface TopPostsBlock extends BaseBlock {
  type: 'top_posts';
  posts: TopPostItem[];
  layout?: 'grid' | 'list';
}

export type AgentAlertSeverity = 'info' | 'warning' | 'error' | 'success';

export interface AlertBlock extends BaseBlock {
  type: 'alert';
  message: string;
  severity?: AgentAlertSeverity;
  dismissible?: boolean;
}

export interface SectionHeaderBlock extends BaseBlock {
  type: 'section_header';
  text: string;
  level?: 1 | 2 | 3;
}

export interface TextParagraphBlock extends BaseBlock {
  type: 'text_paragraph';
  text: string;
}

export interface BulletListBlock extends BaseBlock {
  type: 'bullet_list';
  items: string[];
  ordered?: boolean;
}

export interface CalloutBlock extends BaseBlock {
  type: 'callout';
  message: string;
  tone?: 'info' | 'warning' | 'error' | 'success';
}

/**
 * @deprecated Prefer typed text blocks:
 * - section_header
 * - text_paragraph
 * - bullet_list
 * - callout
 */
export interface MarkdownBlock extends BaseBlock {
  type: 'markdown';
  content: string;
}

export interface ImageGridItem {
  url: string;
  alt?: string;
  caption?: string;
}

export interface ImageGridBlock extends BaseBlock {
  type: 'image_grid';
  images: ImageGridItem[];
  columns?: number;
}

export interface CompositeBlock extends BaseBlock {
  type: 'composite';
  blocks: AgentUIBlock[];
  layout?: 'row' | 'column';
}

export interface EmptyStateBlock extends BaseBlock {
  type: 'empty_state';
  message: string;
  icon?: string;
  ctaLabel?: string;
  ctaAction?: string;
}

export type AgentUIBlock =
  | MetricCardBlock
  | KPIGridBlock
  | ChartBlock
  | TableBlock
  | TopPostsBlock
  | AlertBlock
  | SectionHeaderBlock
  | TextParagraphBlock
  | BulletListBlock
  | CalloutBlock
  | MarkdownBlock
  | ImageGridBlock
  | CompositeBlock
  | EmptyStateBlock;

export type AgentDashboardOperation =
  | 'replace'
  | 'add'
  | 'update'
  | 'remove'
  | 'clear';

export interface AgentDashboardToolPayload {
  operation: AgentDashboardOperation;
  blocks?: AgentUIBlock[];
  blockIds?: string[];
}

export interface AgentUIBlocksEvent {
  conversationId: string;
  userId: string;
  operation: AgentDashboardOperation;
  blocks?: AgentUIBlock[];
  blockIds?: string[];
  timestamp: string;
}
