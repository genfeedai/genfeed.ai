'use client';

import PostsLayoutContent from '@pages/posts/posts-layout-content';
import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';

export default function PostsLayout({ children }: LayoutProps) {
  return (
    <FeatureGate flagKey="posts">
      <PostsLayoutContent>{children}</PostsLayoutContent>
    </FeatureGate>
  );
}
