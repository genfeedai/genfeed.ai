export type GenerationStatusPhase =
  | 'submitting'
  | 'queued'
  | 'generating'
  | 'saving'
  | 'ready'
  | 'failed'
  | 'cancelled';

export interface GenerationStatusProps {
  status: GenerationStatusPhase;
  assetLabel?: string;
  label?: string;
  startedAt?: string | number;
  progress?: number;
  completedCount?: number;
  totalCount?: number;
  detail?: string;
  compact?: boolean;
  /**
   * Center the label, timer and cancel action in a column. Use it where the
   * status sits in a narrow box (a media tile) that a single row would overflow.
   */
  isStacked?: boolean;
  /**
   * Announce status changes through a live region. Set `false` for historical
   * lists, where every rendered row would otherwise announce at once when the
   * list mounts.
   */
  isAnnounced?: boolean;
  className?: string;
  onCancel?: () => void;
  isCancelling?: boolean;
}
