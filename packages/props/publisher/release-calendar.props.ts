import type {
  CredentialPlatform,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  IReleaseAnalyticsComparison,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import type { CalendarItem } from '@props/components/calendar.props';

/**
 * A release placed on the scheduling calendar. The calendar reads the scheduler
 * read model only, so the payload is an `IReleaseGroup` — never a raw post row.
 */
export interface ReleaseCalendarItem extends CalendarItem {
  release: IReleaseGroup;
}

/**
 * Active calendar filters. `status` narrows the release itself; every other
 * facet is target-scoped, so a release survives when *any* of its channel
 * targets matches. An empty array means "no constraint on this facet" rather
 * than "match nothing".
 *
 * The date range is deliberately absent: it is the calendar's own visible
 * window, owned by FullCalendar's navigation rather than by these controls.
 */
export interface ReleaseCalendarFilters {
  credentialId: string[];
  executionState: TargetExecutionState[];
  platform: CredentialPlatform[];
  source: ReleaseTargetSource[];
  status: ReleaseStatus[];
}

export interface ReleaseCalendarFilterOption {
  label: string;
  value: string;
}

export interface ReleaseCalendarFiltersProps {
  /**
   * Connected channels for the active brand. Sourced from the brand context
   * rather than from the loaded releases, so selecting a credential never
   * removes the option that produced the selection.
   */
  credentialOptions: ReleaseCalendarFilterOption[];
  filters: ReleaseCalendarFilters;
  onChange: (filters: ReleaseCalendarFilters) => void;
  /**
   * Platforms the active brand actually has a channel for. Offering the whole
   * `CredentialPlatform` enum would list dozens of providers the operator has
   * never connected, none of which can match a release.
   */
  platformOptions: ReleaseCalendarFilterOption[];
}

export interface ReleaseAnalyticsTableProps {
  comparison?: IReleaseAnalyticsComparison | null;
}

/**
 * One entry in a channel target's execution history.
 *
 * The API does not persist per-target status transitions (only releases and
 * publish approvals carry a transition log), so the drawer derives the history
 * from the target's durable columns when `statusTransitions` is absent.
 */
export interface ReleaseTargetHistoryEntry {
  at: string;
  detail?: string;
  label: string;
}

/** Calendar drag that needs an explicit card-only vs republish choice. */
export interface PendingCalendarDrop {
  release: IReleaseGroup;
  revert: () => void;
  scheduledDate: string;
}

export interface CalendarRepublishDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onChooseCardOnly: () => void;
  onChooseRepublish: () => void;
  pendingAction: string | null;
}

export interface ReleaseDetailDrawerProps {
  /**
   * Brand scope for the drawer's own account-health lookup, which backs the
   * per-target Reconnect action. `undefined`/`null` skips the fetch, so a
   * caller with no brand in scope yet still renders without a Reconnect gate.
   */
  brandId?: string | null;
  /** Message from the most recent failed mutation, already user-safe. */
  error: string | null;
  /** Opens the repurpose flow to add a draft target for another channel. */
  onAddChannel?: () => void;
  onClose: () => void;
  onRescheduleRelease: (scheduledDate: string) => void;
  onRescheduleTarget: (targetId: string, scheduledDate: string) => void;
  onRetryTarget: (targetId: string) => void;
  /**
   * Identifier of the in-flight mutation, or `null` when idle. Drives both the
   * per-control spinner and the blanket disable that stops a second mutation
   * racing the first.
   */
  pendingAction: string | null;
  /** Brand-scoped Social settings route where blocked credentials reconnect. */
  reconnectHref: string;
  release: IReleaseGroup | null;
}
