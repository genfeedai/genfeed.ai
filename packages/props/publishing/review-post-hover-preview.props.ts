import type { IBatchItem } from '@genfeedai/contracts/interfaces';
import type { ReactNode } from 'react';

export interface ReviewPostHoverPreviewProps {
  children: ReactNode;
  className?: string;
  item: IBatchItem;
  /** Select row / open Context rail. */
  onOpenDetail?: () => void;
}
