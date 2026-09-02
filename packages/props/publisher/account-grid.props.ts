import type {
  AccountHealthSummary,
  IChannelTarget,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import type { TargetPreviewCredential } from '@props/ui/previews.props';

export type AccountGridLaneKind = 'cards' | 'grid' | 'landscape' | 'portrait';

export type AccountGridItemKind = 'gap' | 'target';

export interface AccountGridLaneItem {
  gapAt?: string;
  kind: AccountGridItemKind;
  release?: IReleaseGroup;
  target?: IChannelTarget;
}

export interface AccountGridLane {
  account: AccountHealthSummary;
  credential: TargetPreviewCredential;
  items: AccountGridLaneItem[];
  kind: AccountGridLaneKind;
  queuedCount: number;
}

export interface AccountGridProps {
  brandId?: string | null;
  browserTimezone: string;
  isLoading: boolean;
  onSelectRelease: (releaseId: string) => void;
  reconnectHref: string;
  releases: IReleaseGroup[];
  selectedCredentialIds: string[];
}

export interface AccountGridTileProps {
  browserTimezone: string;
  item: AccountGridLaneItem;
  lane: AccountGridLane;
  onSelectRelease: (releaseId: string) => void;
}

export interface AccountGridLaneColumnProps {
  browserTimezone: string;
  lane: AccountGridLane;
  onSelectRelease: (releaseId: string) => void;
  reconnectHref: string;
}
