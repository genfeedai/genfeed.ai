'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import PostsLayoutContent from './posts-layout-content';

export default function PostsLayout({ children }: LayoutProps) {
  return (
    <FeatureGate flagKey="posts">
      <PostsLayoutContent>{children}</PostsLayoutContent>
    </FeatureGate>
  );
}
