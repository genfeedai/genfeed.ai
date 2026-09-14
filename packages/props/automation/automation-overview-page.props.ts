import type { IconComponent } from '@genfeedai/contracts/types/icon';

export interface ActivitySignalProps {
  color: string;
  cta: string;
  description: string;
  href: string;
  icon: IconComponent;
  kicker: string;
  label: string;
}
