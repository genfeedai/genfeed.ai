'use client';

import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import type { ViewType } from '@genfeedai/contracts';
import { useEffect } from 'react';
import PublishingViewToggle from '@/features/posts/library/publishing-view-toggle';

/**
 * Puts the Publishing view switcher in the desk toolbar for a page that is not
 * the Posts list (Calendar, Approvals). Renders nothing itself.
 */
export default function PublishingDeskViewToggle({
  activeView,
}: {
  activeView: ViewType;
}): null {
  const { setViewToggleNode } = usePostsLayout();

  useEffect(() => {
    setViewToggleNode(<PublishingViewToggle activeView={activeView} />);
    return () => setViewToggleNode(null);
  }, [activeView, setViewToggleNode]);

  return null;
}
