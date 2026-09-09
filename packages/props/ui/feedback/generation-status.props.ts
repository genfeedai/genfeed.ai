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
   * Announce status changes through a live region. Set `false` for historical
   * lists, where every rendered row would otherwise announce at once when the
   * list mounts.
   */
  isAnnounced?: boolean;
  className?: string;
  onCancel?: () => void;
  isCancelling?: boolean;
}
