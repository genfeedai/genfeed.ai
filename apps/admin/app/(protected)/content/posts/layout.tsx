'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { PostsLayoutContext } from '@contexts/posts/posts-layout-context';
import { Platform } from '@genfeedai/enums';
import { getPostPlatformTabs } from '@helpers/content/posts.helper';
import Container from '@ui/layout/container/Container';
import Tabs from '@ui/navigation/tabs/Tabs';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { HiOutlineNewspaper } from 'react-icons/hi2';

export default function PostsLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );

  const [refreshFn, setRefreshFn] = useState<(() => void) | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [filtersNode, setFiltersNode] = useState<ReactNode>(null);
  const [exportNode, setExportNode] = useState<ReactNode>(null);
  const [viewToggleNode, setViewToggleNode] = useState<ReactNode>(null);
  const [scheduleActionsNode, setScheduleActionsNode] =
    useState<ReactNode>(null);

  const isListRoute = pathname === '/content/posts';
  const isDetailRoute = pathname.match(/^\/content\/posts\/[^/]+$/);

  const platformParam = parsedSearchParams.get('platform');
  const activeTab =
    platformParam === Platform.YOUTUBE ||
    platformParam === Platform.INSTAGRAM ||
    platformParam === Platform.TWITTER ||
    platformParam === Platform.TIKTOK
      ? platformParam
      : 'all';

  const handleTabChange = useCallback(
    (tab: string) => {
      if (tab === activeTab) {
        return;
      }

      if (tab === 'all') {
        router.push('/content/posts');
      } else {
        router.push(`/content/posts?platform=${tab}`);
      }
    },
    [router, activeTab],
  );

  const handleRefresh = useCallback(() => {
    if (refreshFn) {
      refreshFn();
    } else {
      router.refresh();
    }
  }, [refreshFn, router]);

  if (isDetailRoute) {
    return (
      <PostsLayoutContext.Provider
        value={{
          setExportNode: () => {},
          setFiltersNode: () => {},
          setIsRefreshing: () => {},
          setRefresh: () => {},
          setScheduleActionsNode: () => {},
          setViewToggleNode: () => {},
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
        description="View and manage published content across all connected accounts"
        icon={HiOutlineNewspaper}
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
        {isListRoute && (
          <div className="mb-6">
            <Tabs
              activeTab={activeTab}
              onTabChange={handleTabChange}
              tabs={getPostPlatformTabs()}
            />
          </div>
        )}

        {children}
      </Container>
    </PostsLayoutContext.Provider>
  );
}
