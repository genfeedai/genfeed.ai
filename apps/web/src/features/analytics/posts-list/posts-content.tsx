'use client';

import type { BrandRemixSourceSelector } from '@genfeedai/contracts/api-types/contracts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import AnalyticsPostsList from '@/features/analytics/posts-list/analytics-posts-list';
import {
  DiscoveryRemixProvider,
  useDiscoveryRemix,
} from '@/features/research/remix/DiscoveryRemixProvider';
import RemixBriefInspector from '@/features/research/remix/RemixBriefInspector';

const REMIX_POST_PARAM = 'remixPostId';
const REMIX_SOURCE_POST_PARAM = 'remixSourcePostId';

/**
 * A breakout notification links here with the post to remix. Open that remix
 * once, then drop the parameter so a refresh or a shared link doesn't reopen it.
 */
function RemixDeepLink() {
  const remix = useDiscoveryRemix();
  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const handledRef = useRef<string | null>(null);
  const postId = searchParams.get(REMIX_POST_PARAM);
  const sourcePostId = searchParams.get(REMIX_SOURCE_POST_PARAM);

  useEffect(() => {
    const selector: BrandRemixSourceSelector | null = postId
      ? { kind: 'owned_post', postId }
      : sourcePostId
        ? { kind: 'source_post', sourcePostId }
        : null;
    const key = postId ?? sourcePostId;
    if (!selector || !key || handledRef.current === key) return;
    handledRef.current = key;
    void remix.openRemix(selector);
    const next = new URLSearchParams(searchParams.toString());
    next.delete(REMIX_POST_PARAM);
    next.delete(REMIX_SOURCE_POST_PARAM);
    const query = next.toString();
    replace(query ? `${pathname}?${query}` : pathname);
  }, [pathname, postId, remix, replace, searchParams, sourcePostId]);

  return null;
}

export default function PostsContent() {
  return (
    <DiscoveryRemixProvider>
      <RemixBriefInspector />
      <RemixDeepLink />
      <AnalyticsPostsList />
    </DiscoveryRemixProvider>
  );
}
