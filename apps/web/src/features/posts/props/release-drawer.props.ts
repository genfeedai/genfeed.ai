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
    | 'onChangeCampaign'
    | 'onCompleteManualPost'
    | 'onRescheduleRelease'
    | 'onRescheduleTarget'
    | 'onRetryTarget'
    | 'onSkipManualPost'
    | 'pendingAction'
    | 'reconnectHref'
    | 'seriesControls'
  > {
  accountHealth: AccountHealthSummary[];
  /** The full editor for the caption and media; hidden without one. */
  editorHref: string | null;
  release: IReleaseGroup;
}

export interface ReleaseGlobalPreviewProps {
  release: IReleaseGroup;
  targets: IChannelTarget[];
}

export interface ReleaseCampaignFieldProps {
  /** Campaign the release belongs to, or `null` when it is in none. */
  campaignId: string | null | undefined;
  isDisabled: boolean;
  /** `null` takes the release out of its campaign. */
  onChange: (campaignId: string | null) => void;
}
