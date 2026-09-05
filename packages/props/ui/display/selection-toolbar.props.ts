import type { ReactNode } from 'react';

export interface SelectionToolbarProps {
  count: number;
  label: string;
  onClear: () => void;
  clearLabel?: string;
  children: ReactNode;
}
