import type { ComponentType } from 'react';

export interface LinkItem {
  label: string;
  icon: ComponentType<{ className?: string }>;
  url: string;
}
