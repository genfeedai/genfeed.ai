import type {
  AccountHealthSummary,
  IChannelTarget,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import type { ReleaseDetailDrawerProps } from '@/props/publisher/release-calendar.props';

/** The views the post context drawer swaps between from its header icons. */
export type ReleaseDrawerView = 'analytics' | 'details' | 'history' | 'preview';

export interface ReleaseViewSwitcherProps {
  activeView: ReleaseDrawerView;
  /** The full editor for this post; the menu hides the entry without one. */
  editorHref: string | null;
  onViewChange: (view: ReleaseDrawerView) => void;
}

export interface ReleasePreviewPanelProps {
  release: IReleaseGroup;
}

export interface ReleaseHistoryViewProps {
  release: IReleaseGroup;
}

export interface ReleaseDetailsViewProps
  extends Pick<
    ReleaseDetailDrawerProps,
    | 'onAddChannel'
    | 'onCompleteManualPost'
    | 'onRescheduleRelease'
    | 'onRescheduleTarget'
    | 'onRetryTarget'
    | 'onSkipManualPost'
    | 'pendingAction'
    | 'reconnectHref'
  > {
  accountHealth: AccountHealthSummary[];
  release: IReleaseGroup;
}

export interface ReleaseGlobalPreviewProps {
  release: IReleaseGroup;
  targets: IChannelTarget[];
}
