import type { IconComponent } from '@genfeedai/contracts/types/icon';

export interface PublisherTool {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: IconComponent;
  comingSoon?: boolean;
}
