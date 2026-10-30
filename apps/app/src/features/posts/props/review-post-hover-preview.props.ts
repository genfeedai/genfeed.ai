import type { ITurboRunItem } from '@genfeedai/contracts/interfaces';
import type { ReactNode } from 'react';

export interface ReviewPostHoverPreviewProps {
  children: ReactNode;
  className?: string;
  item: ITurboRunItem;
  /** Select row / open Context rail. */
  onOpenDetail?: () => void;
}
