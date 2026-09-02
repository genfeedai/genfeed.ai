import type { ComponentType } from 'react';

export interface GenerateOption {
  id: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  href: string;
}
