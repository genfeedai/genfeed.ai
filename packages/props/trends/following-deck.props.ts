import type { ISocialSource } from '@genfeedai/contracts/interfaces';

import type { DiscoveryDeskItem } from './discovery-desk.props';

export interface FollowingDeckColumn {
  items: DiscoveryDeskItem[];
  platform: string;
  sources: ISocialSource[];
}

export interface FollowingDeckProps {
  brandId: string;
  cursorKey: string | null;
  items: DiscoveryDeskItem[];
  onCursor: (key: string) => void;
  onSelectFinding?: (item: DiscoveryDeskItem) => void;
  onSourcesChanged: () => Promise<void>;
  onToggleSelect: (key: string) => void;
  selection: Set<string>;
  sources: ISocialSource[];
}

export interface FollowingDeckPostProps {
  isCursored: boolean;
  isSelected: boolean;
  item: DiscoveryDeskItem;
  onCursor: (key: string) => void;
  onSelectFinding?: (item: DiscoveryDeskItem) => void;
  onToggleSelect: (key: string) => void;
}
