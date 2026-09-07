import type { ComponentType } from 'react';

export interface ActivitySignalProps {
  color: string;
  cta: string;
  description: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  kicker: string;
  label: string;
}
