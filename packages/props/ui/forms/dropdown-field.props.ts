import type { ReactNode } from 'react';

export interface DropdownFieldOption {
  key: string | number;
  label: string;
  description?: string;
  thumbnailUrl?: string;
  badge?: string;
  badgeVariant?:
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'info'
    | 'success'
    | 'warning'
    | 'error';
  icon?: ReactNode;
  group?: string;
}

export interface DropdownFieldTab {
  id: string;
  label: string;
}
