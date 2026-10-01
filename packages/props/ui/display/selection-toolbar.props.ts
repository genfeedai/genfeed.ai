import type { ReactNode } from 'react';

export interface SelectionToolbarProps {
  count: number;
  label: string;
  onClear: () => void;
  clearLabel?: string;
  children: ReactNode;
  /**
   * `overlay` floats over the list. `subtopbar` sits in a pinned filters bar.
   */
  placement?: 'overlay' | 'subtopbar';
}
