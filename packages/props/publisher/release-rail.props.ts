import type { IReleaseGroup } from '@genfeedai/interfaces';
import type { ReleaseRailSegment } from '@pages/posts/rail/release-rail-segments.helpers';

export interface ReleaseRailSegmentsProps {
  counts?: Partial<Record<ReleaseRailSegment, number>>;
  onSegmentChange: (segment: ReleaseRailSegment) => void;
  segment: ReleaseRailSegment;
}

export interface ReleaseRailAccountsProps {
  brandId?: string | null;
  onToggle: (credentialId: string) => void;
  selectedCredentialIds: string[];
}

export interface ReleaseRailRowProps {
  browserTimezone: string;
  index?: number;
  isActive: boolean;
  onActivate: () => void;
  release: IReleaseGroup;
  registerRow?: (element: HTMLElement | null) => void;
}

export type ReleaseRailTargetTone =
  | 'destructive'
  | 'info'
  | 'secondary'
  | 'success'
  | 'warning';

export interface ReleaseRailOutcomeSummary {
  failed: number;
  pending: number;
  published: number;
}
