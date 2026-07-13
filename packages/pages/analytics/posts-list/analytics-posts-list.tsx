'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { AnalyticsMetric, ButtonVariant, PageScope } from '@genfeedai/enums';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useTopPosts } from '@hooks/data/analytics/use-top-posts/use-top-posts';
import PostDetailOverlay from '@pages/posts/detail/PostDetailOverlay';
import type { TableColumn } from '@props/ui/display/table.props';
import Table from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { buildAgentPromptHref } from '@utils/url/desktop-loop-url.util';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { HiOutlineChartBar, HiSquares2X2 } from 'react-icons/hi2';

interface PostsListItem {
  postId: string;
  label: string;
  platform: string;
  brandName: string;
  totalViews: number;
  totalEngagement: number;
  engagementRate: number;
}

const METRIC_OPTIONS: Array<{
  label: string;
  value:
    | AnalyticsMetric.VIEWS
    | AnalyticsMetric.ENGAGEMENT
    | AnalyticsMetric.LIKES;
}> = [
  { label: 'Views', value: AnalyticsMetric.VIEWS },
  { label: 'Engagement', value: AnalyticsMetric.ENGAGEMENT },
  { label: 'Likes', value: AnalyticsMetric.LIKES },
];

const PLATFORM_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Twitter', value: 'twitter' },
  { label: 'Facebook', value: 'facebook' },
] as const;

type PlatformFilterValue = (typeof PLATFORM_OPTIONS)[number]['value'];

export default function AnalyticsPostsList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlFocusedPostId = searchParams.get('postId')?.trim() || '';
  const [localFocusedPostId, setLocalFocusedPostId] = useState<
    string | null | undefined
  >(undefined);
  const { filters, setFilter } = useAnalyticsContext();
  const focusedPostId =
    (localFocusedPostId === undefined
      ? (filters.postId ?? urlFocusedPostId)
      : localFocusedPostId) ?? '';
  const search = filters.query ?? focusedPostId;
  const metric = (filters.metric ?? AnalyticsMetric.VIEWS) as
    | AnalyticsMetric.VIEWS
    | AnalyticsMetric.ENGAGEMENT
    | AnalyticsMetric.LIKES;
  const platform = (filters.platform ?? 'all') as PlatformFilterValue;

  useEffect(() => {
    setLocalFocusedPostId(urlFocusedPostId || null);
  }, [urlFocusedPostId]);

  const setFocusedPost = useCallback(
    (postId?: string) => {
      setLocalFocusedPostId(postId ?? null);
      const nextSearchParams = new URLSearchParams(searchParams.toString());
      if (postId) {
        nextSearchParams.set('postId', postId);
      } else {
        nextSearchParams.delete('postId');
      }
      const query = nextSearchParams.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const { isLoading, topPosts } = useTopPosts({
    limit: 50,
    metric,
    platform: platform === 'all' ? undefined : platform,
  });

  const items: PostsListItem[] = useMemo(
    () =>
      topPosts.reduce<PostsListItem[]>((acc, post) => {
        const label = post.label || post.description || '';
        const normalizedSearch = search.trim().toLowerCase();
        if (
          normalizedSearch &&
          post.postId !== normalizedSearch &&
          !label.toLowerCase().includes(normalizedSearch) &&
          !(post.brandName || '').toLowerCase().includes(normalizedSearch) &&
          !post.platform.toLowerCase().includes(normalizedSearch)
        ) {
          return acc;
        }
        acc.push({
          brandName: post.brandName || 'Unknown brand',
          engagementRate: post.engagementRate || 0,
          label: post.label || post.description || 'Untitled Post',
          platform: post.platform,
          postId: post.postId,
          totalEngagement: post.totalEngagement || 0,
          totalViews: post.totalViews || 0,
        });
        return acc;
      }, []),
    [search, topPosts],
  );

  const selectedPlatformOption = useMemo(
    () =>
      PLATFORM_OPTIONS.find((option) => option.value === platform) ??
      PLATFORM_OPTIONS[0],
    [platform],
  );

  const renderPlatformOption = (
    option: (typeof PLATFORM_OPTIONS)[number],
  ): ReactNode => {
    const icon =
      option.value === 'all' ? (
        <HiSquares2X2 className="size-4 shrink-0 text-foreground/70" />
      ) : (
        getPlatformIcon(option.value, 'h-4 w-4 shrink-0')
      );

    return (
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="truncate">{option.label}</span>
      </div>
    );
  };

  const columns: TableColumn<PostsListItem>[] = useMemo(
    () => [
      {
        header: 'Post',
        key: 'label',
        render: (item) => (
          <div className="flex flex-col">
            <span className="font-medium line-clamp-1">{item.label}</span>
            <span className="text-xs text-foreground/60">
              {item.brandName} · {item.platform}
            </span>
          </div>
        ),
      },
      {
        className: 'text-right',
        header: 'Views',
        key: 'totalViews',
        render: (item) => (
          <span className="font-mono">{item.totalViews.toLocaleString()}</span>
        ),
      },
      {
        className: 'text-right',
        header: 'Engagement',
        key: 'totalEngagement',
        render: (item) => (
          <span className="font-mono">
            {item.totalEngagement.toLocaleString()}
          </span>
        ),
      },
      {
        className: 'text-right',
        header: 'Eng. Rate',
        key: 'engagementRate',
        render: (item) => (
          <span className="font-mono">{item.engagementRate.toFixed(2)}%</span>
        ),
      },
    ],
    [],
  );

  return (
    <Container
      label="Top Posts"
      description="Post performance in the selected period"
      icon={HiOutlineChartBar}
      right={
        <div className="flex items-center gap-2">
          {focusedPostId ? (
            <Button
              label="Clear Focus"
              variant={ButtonVariant.OUTLINE}
              onClick={() => setFocusedPost()}
            />
          ) : null}
          <Button
            label="Open In Agent"
            variant={ButtonVariant.OUTLINE}
            onClick={() =>
              router.push(
                buildAgentPromptHref(
                  focusedPostId
                    ? `Review the analytics for post ${focusedPostId} and tell me the best next step in the loop.`
                    : 'Review my top posts and tell me what I should remix or repeat next.',
                ),
              )
            }
          />
          <Input
            aria-label="Search posts"
            type="text"
            placeholder="Search posts..."
            value={search}
            onChange={(event) => setFilter('query', event.target.value)}
            className="w-full sm:w-64"
          />

          <Select
            value={metric}
            onValueChange={(value) => setFilter('metric', value)}
          >
            <SelectTrigger
              aria-label="Sort post analytics by metric"
              className="w-full sm:w-36"
            >
              <SelectValue placeholder="Metric" />
            </SelectTrigger>
            <SelectContent>
              {METRIC_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={platform}
            onValueChange={(value) =>
              setFilter('platform', value === 'all' ? undefined : value)
            }
          >
            <SelectTrigger
              aria-label="Filter post analytics by platform"
              className="w-full sm:w-36"
            >
              {renderPlatformOption(selectedPlatformOption)}
            </SelectTrigger>
            <SelectContent>
              {PLATFORM_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {renderPlatformOption(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >
      {focusedPostId ? (
        <p className="mb-4 text-sm text-primary">
          Focused on a single post from the loop. Open the post detail to remix,
          or ask the agent for the next step.
        </p>
      ) : null}

      <Table<PostsListItem>
        items={items}
        isLoading={isLoading}
        columns={columns}
        emptyLabel="No posts found for this period"
        getRowKey={(item) => item.postId}
        onRowClick={(item) => setFocusedPost(item.postId)}
      />

      <PostDetailOverlay
        postId={focusedPostId || null}
        scope={PageScope.ANALYTICS}
        onClose={() => setFocusedPost()}
      />
    </Container>
  );
}
