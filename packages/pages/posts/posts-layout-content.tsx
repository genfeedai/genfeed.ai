'use client';

import {
  PostsLayoutContext,
  type RefreshFunction,
} from '@contexts/posts/posts-layout-context';
import {
  getPublisherPostsHref,
  normalizePublisherPostsStatus,
} from '@helpers/content/posts.helper';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { HiOutlineNewspaper } from 'react-icons/hi2';

export default function PostsLayoutContent({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );

  const [refreshFn, setRefreshFn] = useState<
    RefreshFunction | (() => RefreshFunction) | null
  >(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [filtersNode, setFiltersNode] = useState<ReactNode>(null);
  const [exportNode, setExportNode] = useState<ReactNode>(null);
  const [viewToggleNode, setViewToggleNode] = useState<ReactNode>(null);
  const [scheduleActionsNode, setScheduleActionsNode] =
    useState<ReactNode>(null);

  const knownSubRoutes: string[] = [];
  const lastSegment = pathname?.split('/').pop();
  const isDetailRoute =
    pathname?.match(/^\/posts\/[^/]+$/) &&
    !knownSubRoutes.includes(lastSegment ?? '');
  const activeTab = useMemo(() => {
    return getPublisherPostsHref({
      platform: parsedSearchParams.get('platform'),
      status: normalizePublisherPostsStatus(parsedSearchParams.get('status')),
    });
  }, [pathname, parsedSearchParams]);
  const tabs = useMemo(
    () => [
      {
        href: getPublisherPostsHref({
          platform: parsedSearchParams.get('platform'),
        }),
        label: 'Drafts',
      },
      {
        href: getPublisherPostsHref({
          platform: parsedSearchParams.get('platform'),
          status: 'scheduled',
        }),
        label: 'Scheduled',
      },
      {
        href: getPublisherPostsHref({
          platform: parsedSearchParams.get('platform'),
          status: 'public',
        }),
        label: 'Published',
      },
    ],
    [parsedSearchParams],
  );

  const handleRefresh = useCallback(() => {
    if (typeof refreshFn === 'function') {
      refreshFn();
    } else {
      router.refresh();
    }
  }, [refreshFn, router]);

  // Detail routes (e.g. /posts/abc123) skip the Container layout
  if (isDetailRoute) {
    return (
      <PostsLayoutContext.Provider
        value={{
          setExportNode: () => {
            /* noop */
          },
          setFiltersNode: () => {
            /* noop */
          },
          setIsRefreshing: () => {
            /* noop */
          },
          setRefresh: () => {
            /* noop */
          },
          setScheduleActionsNode: () => {
            /* noop */
          },
          setViewToggleNode: () => {
            /* noop */
          },
        }}
      >
        {children}
      </PostsLayoutContext.Provider>
    );
  }

  return (
    <PostsLayoutContext.Provider
      value={{
        setExportNode,
        setFiltersNode,
        setIsRefreshing,
        setRefresh: setRefreshFn,
        setScheduleActionsNode,
        setViewToggleNode,
      }}
    >
      <Container
        label="Posts"
        description="Manage and publish across platforms."
        icon={HiOutlineNewspaper}
        tabs={tabs}
        activeTab={activeTab}
        right={
          <div className="flex items-center gap-2">
            {viewToggleNode}
            {filtersNode}
            {exportNode}
            {scheduleActionsNode}
            <ButtonRefresh
              onClick={handleRefresh}
              isRefreshing={isRefreshing}
            />
          </div>
        }
      >
        {children}
      </Container>
    </PostsLayoutContext.Provider>
  );
}
