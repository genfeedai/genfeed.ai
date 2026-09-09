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
  className?: string;
  onCancel?: () => void;
  isCancelling?: boolean;
}
