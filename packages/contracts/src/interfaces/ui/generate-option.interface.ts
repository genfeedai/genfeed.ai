import type { IconComponent } from '@genfeedai/contracts/types/icon';

export interface GenerateOption {
  id: string;
  title: string;
  description: string;
  icon: IconComponent;
  href: string;
}
