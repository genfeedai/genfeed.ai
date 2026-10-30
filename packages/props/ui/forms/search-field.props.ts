import type { ChangeEvent, ReactNode } from 'react';

export interface SearchFieldProps {
  /** The Filters menu (or any trailing control) attached inside the field. */
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
  value?: string;
  /** Fires on every keystroke, for in-memory filtering. */
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Fires debounced, and on Enter or clear, for queries that hit the router or network. */
  onSearch?: (value: string) => void;
}
