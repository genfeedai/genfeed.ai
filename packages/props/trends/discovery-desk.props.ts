import type { BrandRemixSourceSelector } from '@api-types/contracts/brand-remix-run.contract';
import type { ISourcePost, ITrendVideo } from '@genfeedai/interfaces';

import type { TrendContentItem } from './trends-page.props';

export type DiscoveryDeskItemKind = 'trend' | 'source_post' | 'viral_video';

/**
 * `trends` = public platform trend surface, `following` = creators the brand
 * follows via Social Sources, `owned` = the brand's own connected accounts
 * (source classification `owned_brand_reference`).
 */
export type DiscoveryDeskSource = 'trends' | 'following' | 'owned';

export type DiscoveryDeskSort =
  | 'velocity'
  | 'virality'
  | 'recency'
  | 'engagement';

export interface DiscoveryDeskItemMetrics {
  comments?: number;
  likes?: number;
  shares?: number;
  views?: number;
}

export interface DiscoveryDeskItem {
  /** Stable across the table/light-table views: `${kind}:${id}`. */
  key: string;
  kind: DiscoveryDeskItemKind;
  id: string;
  platform: string;
  source: DiscoveryDeskSource;
  authorHandle?: string;
  title?: string;
  text?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  sourceUrl?: string;
  contentType: 'image' | 'post' | 'tweet' | 'video';
  publishedAt?: string;
  metrics: DiscoveryDeskItemMetrics;
  /** Sum of the available metrics. */
  engagement: number;
  /** Engagement per hour since publishedAt. 0 when publishedAt is unknown. */
  velocity: number;
  /** trendViralityScore for trend items, 0 for source posts and viral videos. */
  virality: number;
  trendTopic?: string;
  matchedTrends: string[];
  /** null when remix is unavailable for this item. */
  remixSelector: BrandRemixSourceSelector | null;
  raw:
    | { kind: 'trend'; item: TrendContentItem }
    | { kind: 'source_post'; post: ISourcePost }
    | { kind: 'viral_video'; video: ITrendVideo };
}

export interface DeskLightTableViewProps {
  cursorKey: string | null;
  href: (path: string) => string;
  items: DiscoveryDeskItem[];
  onCursor: (key: string) => void;
  onSelectFinding?: (item: DiscoveryDeskItem) => void;
  onToggleSelect: (key: string) => void;
  selection: Set<string>;
}

export interface DeskSelectionBarProps {
  items: DiscoveryDeskItem[];
  onClear: () => void;
}

export interface UseDeskKeyboardOptions {
  cursorKey: string | null;
  onClearSelection: () => void;
  onMoveCursor: (direction: 1 | -1) => void;
  onRemix: (item: DiscoveryDeskItem) => void;
  onToggleSelect: (key: string) => void;
  selectedItem: DiscoveryDeskItem | null;
}
