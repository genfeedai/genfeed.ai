import type { ComponentType } from 'react';

export interface PublisherTool {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  comingSoon?: boolean;
}
