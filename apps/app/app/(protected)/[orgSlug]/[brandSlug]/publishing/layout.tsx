'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import PublishingLayoutContent from './publishing-layout-content';

export default function PublishingLayout({ children }: LayoutProps) {
  return <PublishingLayoutContent>{children}</PublishingLayoutContent>;
}
