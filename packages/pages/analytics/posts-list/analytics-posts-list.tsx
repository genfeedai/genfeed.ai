'use client';

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
import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
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
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [metric, setMetric] = useState<
    AnalyticsMetric.VIEWS | AnalyticsMetric.ENGAGEMENT | AnalyticsMetric.LIKES
  >(AnalyticsMetric.VIEWS);
  const [platform, setPlatform] = useState<PlatformFilterValue>('all');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const focusedPostId = searchParams.get('postId')?.trim() || '';

  useEffect(() => {
    if (!focusedPostId) {
      return;
    }
    setSearch(focusedPostId);
  }, [focusedPostId]);

  const { isLoading, topPosts } = useTopPosts({
    limit: 50,
    metric,
    platform: platform === 'all' ? undefined : platform,
  });

  const items: PostsListItem[] = useMemo(
    () =>
      topPosts
        .filter((post) => {
          const label = post.label || post.description || '';
          const normalizedSearch = search.trim().toLowerCase();
          if (!normalizedSearch) {
            return true;
          }

          return (
            post.postId === normalizedSearch ||
            label.toLowerCase().includes(normalizedSearch) ||
            (post.brandName || '').toLowerCase().includes(normalizedSearch) ||
            post.platform.toLowerCase().includes(normalizedSearch)
          );
        })
        .map((post) => ({
          brandName: post.brandName || 'Unknown brand',
          engagementRate: post.engagementRate || 0,
          label: post.label || post.description || 'Untitled Post',
          platform: post.platform,
          postId: post.postId,
          totalEngagement: post.totalEngagement || 0,
          totalViews: post.totalViews || 0,
        })),
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
        <HiSquares2X2 className="h-4 w-4 shrink-0 text-foreground/70" />
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
              onClick={() => router.push('/analytics/posts')}
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
            type="text"
            placeholder="Search posts..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full sm:w-64"
          />

          <Select
            value={metric}
            onValueChange={(value) =>
              setMetric(
                value as
                  | AnalyticsMetric.VIEWS
                  | AnalyticsMetric.ENGAGEMENT
                  | AnalyticsMetric.LIKES,
              )
            }
          >
            <SelectTrigger className="w-full sm:w-36">
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
            onValueChange={(value) => setPlatform(value as PlatformFilterValue)}
          >
            <SelectTrigger className="w-full sm:w-36">
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
        onRowClick={(item) => setSelectedPostId(item.postId)}
      />

      <PostDetailOverlay
        postId={selectedPostId}
        scope={PageScope.ANALYTICS}
        onClose={() => setSelectedPostId(null)}
      />
    </Container>
  );
}
