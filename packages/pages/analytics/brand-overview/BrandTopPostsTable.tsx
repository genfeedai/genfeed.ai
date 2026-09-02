'use client';

import { PostStatus } from '@genfeedai/contracts';
import { getPublishingPostsHref } from '@helpers/content/posts.helper';
import {
  formatCompactNumberIntl,
  formatPercentageSimple,
} from '@helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { Post } from '@models/content/post.model';
import Card from '@ui/card/Card';
import HtmlContent from '@ui/display/html-content/HtmlContent';
import Table from '@ui/display/table/Table';
import { ArrowRight, Video } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

type PostWithAnalytics = Post & {
  totalViews?: number;
  totalLikes?: number;
  totalComments?: number;
  engagementRate?: number;
};

type BrandTopPostsTableProps = {
  formatDate: (dateStr: string) => string;
  isLoadingPosts: boolean;
  onSelectPost: (postId: string) => void;
  topPosts: Post[];
};

export default function BrandTopPostsTable({
  formatDate,
  isLoadingPosts,
  onSelectPost,
  topPosts,
}: BrandTopPostsTableProps) {
  return (
    <Card
      label="Recent Posts (Top 5)"
      bodyClassName="gap-3 p-4 pb-0"
      headerAction={
        <Link
          href={getPublishingPostsHref({ status: PostStatus.PUBLIC })}
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          View All
        </Link>
      }
    >
      <div className="-mx-4 overflow-x-auto">
        <Table
          items={topPosts}
          isLoading={isLoadingPosts}
          emptyLabel="No published posts found for this brand"
          getRowKey={(post) => post.id}
          onRowClick={(post) => onSelectPost(post.id)}
          columns={[
            {
              header: 'Preview',
              key: 'thumbnail',
              render: (post) => {
                const ingredient = post.ingredients?.[0];
                const thumbnailUrl =
                  ingredient?.thumbnailUrl || ingredient?.ingredientUrl;
                return (
                  <div className="flex items-center gap-3">
                    {thumbnailUrl ? (
                      <Image
                        src={thumbnailUrl}
                        alt="Post thumbnail"
                        width={64}
                        height={64}
                        className="size-16 object-cover"
                      />
                    ) : (
                      <div className="size-16 bg-muted flex items-center justify-center">
                        <Video className="size-6 text-foreground/30" />
                      </div>
                    )}
                    <div className="max-w-xs">
                      {post.description ? (
                        <HtmlContent
                          content={post.description}
                          className="font-medium line-clamp-2 text-sm"
                        />
                      ) : (
                        <div className="font-medium line-clamp-2 text-sm">
                          {ingredient?.metadataLabel || 'Untitled'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              },
            },
            {
              header: 'Platform',
              key: 'platform',
              render: (post) => (
                <div className="flex items-center justify-center">
                  {post.platform
                    ? getPlatformIcon(post.platform, 'size-5')
                    : null}
                </div>
              ),
            },
            {
              header: 'Published',
              key: 'publishedAt',
              render: (post) => (
                <span className="text-sm">
                  {post.publishedAt ? formatDate(post.publishedAt) : '-'}
                </span>
              ),
            },
            {
              header: 'Views',
              key: 'totalViews',
              render: (post) => {
                const postWithAnalytics = post as PostWithAnalytics;
                return (
                  <span className="font-mono font-semibold">
                    {formatCompactNumberIntl(postWithAnalytics.totalViews || 0)}
                  </span>
                );
              },
            },
            {
              header: 'Likes',
              key: 'totalLikes',
              render: (post) => {
                const postWithAnalytics = post as PostWithAnalytics;
                return (
                  <span className="font-mono">
                    {formatCompactNumberIntl(postWithAnalytics.totalLikes || 0)}
                  </span>
                );
              },
            },
            {
              header: 'Comments',
              key: 'totalComments',
              render: (post) => {
                const postWithAnalytics = post as PostWithAnalytics;
                return (
                  <span className="font-mono">
                    {formatCompactNumberIntl(
                      postWithAnalytics.totalComments || 0,
                    )}
                  </span>
                );
              },
            },
            {
              header: 'Eng. Rate',
              key: 'engagementRate',
              render: (post) => {
                const postWithAnalytics = post as PostWithAnalytics;
                return (
                  <span className="font-mono">
                    {formatPercentageSimple(
                      postWithAnalytics.engagementRate || 0,
                      2,
                    )}
                  </span>
                );
              },
            },
          ]}
          actions={[
            {
              icon: <ArrowRight className="size-4" />,
              onClick: (post) => onSelectPost(post.id),
              tooltip: 'View Post Details',
            },
          ]}
        />
      </div>
    </Card>
  );
}
