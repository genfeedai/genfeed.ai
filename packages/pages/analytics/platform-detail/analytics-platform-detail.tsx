'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Post } from '@models/content/post.model';
import PostDetailOverlay from '@pages/posts/detail/PostDetailOverlay';
import { BrandsService } from '@services/social/brands.service';
import Button from '@ui/buttons/base/Button';
import Table from '@ui/display/table/Table';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Container from '@ui/layout/container/Container';
import { PageScope } from '@ui-constants/misc.constant';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  HiArrowLeft,
  HiArrowRight,
  HiChartBar,
  HiEye,
  HiFire,
  HiHeart,
  HiTrophy,
  HiVideoCamera,
} from 'react-icons/hi2';

export interface AnalyticsPlatformDetailProps {
  brandId: string;
  platform: string;
  basePath?: string;
}

export default function AnalyticsPlatformDetail({
  brandId,
  platform,
  basePath = '/analytics',
}: AnalyticsPlatformDetailProps) {
  const router = useRouter();
  const { refreshTrigger } = useAnalyticsContext();

  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [brandName, setBrandName] = useState('');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  useEffect(() => {
    const fetchPosts = async () => {
      setIsLoading(true);
      try {
        const service = await getBrandsService();

        const brand = await service.findOne(brandId);
        setBrandName(brand.label);

        const postsData = await service.findBrandPosts(brandId, {
          limit: ITEMS_PER_PAGE * 8,
          page: 1,
          sort: '-createdAt',
        });

        const platformPosts = postsData.filter(
          (post) => post.platform.toLowerCase() === platform.toLowerCase(),
        );
        setPosts(platformPosts);
      } catch {
        // Error handling
      } finally {
        setIsLoading(false);
      }
    };

    fetchPosts();
  }, [brandId, platform, getBrandsService]);

  const totalViews = posts.reduce(
    (sum, post) => sum + (post.totalViews || 0),
    0,
  );

  const totalLikes = posts.reduce(
    (sum, post) => sum + (post.totalLikes || 0),
    0,
  );

  const totalComments = posts.reduce(
    (sum, post) => sum + (post.totalComments || 0),
    0,
  );

  const totalShares = posts.reduce(
    (sum, post) => sum + (post.totalShares || 0),
    0,
  );

  const totalEngagement = totalLikes + totalComments + totalShares;
  const avgEngagementRate =
    posts.length > 0
      ? posts.reduce((sum, post) => sum + (post.avgEngagementRate || 0), 0) /
        posts.length
      : 0;
  const avgViewsPerPost = posts.length > 0 ? totalViews / posts.length : 0;
  const bestPost = posts.reduce(
    (best, post) =>
      (post.totalViews || 0) > (best.totalViews || 0) ? post : best,
    posts[0],
  );

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(num);
  };

  const formatPercentage = (num: number) => {
    return `${num.toFixed(2)}%`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  };

  const platformLabel =
    platform.charAt(0).toUpperCase() + platform.slice(1).toLowerCase();

  return (
    <Container
      label={`${platformLabel} Performance`}
      description={`${brandName} - ${posts.length} posts on ${platformLabel}`}
      icon={HiChartBar}
      left={
        <Button
          onClick={() => router.push(`${basePath}/brands/${brandId}`)}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
          className="gap-2"
          icon={<HiArrowLeft className="w-4 h-4" />}
          label="Back to Brand"
        />
      }
    >
      <KPISection
        title={`${platformLabel} Metrics`}
        gridCols={{ desktop: 3, mobile: 1, tablet: 3 }}
        className="bg-background"
        isLoading={isLoading}
        items={[
          {
            description: 'Published content',
            icon: HiVideoCamera,
            iconClassName: 'bg-white/10 text-foreground',
            label: 'Total Posts',
            value: posts.length,
          },
          {
            description: 'All posts combined',
            icon: HiEye,
            iconClassName: 'bg-white/10 text-foreground',
            label: 'Total Views',
            value: formatNumber(totalViews),
          },
          {
            description: 'Per content piece',
            icon: HiChartBar,
            iconClassName: 'bg-white/10 text-foreground',
            label: 'Avg Views/Post',
            value: formatNumber(avgViewsPerPost),
          },
          {
            description: `${formatNumber(totalLikes)} likes, ${formatNumber(totalComments)} comments`,
            icon: HiHeart,
            iconClassName: 'bg-white/10 text-foreground',
            label: 'Total Engagement',
            value: formatNumber(totalEngagement),
          },
          {
            description: 'Average across posts',
            icon: HiFire,
            iconClassName: 'bg-white/10 text-foreground',
            label: 'Engagement Rate',
            value: formatPercentage(avgEngagementRate),
          },
          {
            description: bestPost ? 'views on top post' : 'No posts yet',
            icon: HiTrophy,
            iconClassName: 'bg-white/10 text-foreground',
            label: 'Best Performing',
            value: bestPost ? formatNumber(bestPost.totalViews || 0) : 0,
          },
        ]}
      />

      <div className="bg-background p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            All {platformLabel} Posts ({posts.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <Table
            items={posts}
            isLoading={isLoading}
            emptyLabel={`No posts found on ${platformLabel}`}
            getRowKey={(post) => post.id}
            onRowClick={(post) => setSelectedPostId(post.id)}
            columns={[
              {
                header: 'Preview',
                key: 'thumbnail',
                render: (post) => (
                  <div className="flex items-center gap-3">
                    {post.ingredients?.[0]?.thumbnailUrl ? (
                      <Image
                        src={post.ingredients?.[0]?.thumbnailUrl}
                        alt="Post thumbnail"
                        width={64}
                        height={64}
                        className="w-16 h-16 object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-muted flex items-center justify-center">
                        <HiVideoCamera className="w-6 h-6 text-foreground/30" />
                      </div>
                    )}
                    <div className="max-w-xs">
                      <div className="font-medium line-clamp-2 text-sm">
                        {post.ingredients?.[0]?.metadataLabel || 'No caption'}
                      </div>
                    </div>
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
                render: (post) => (
                  <span className="font-mono font-semibold">
                    {formatNumber(post.totalViews || 0)}
                  </span>
                ),
              },
              {
                header: 'Likes',
                key: 'totalLikes',
                render: (post) => (
                  <span className="font-mono">
                    {formatNumber(post.totalLikes || 0)}
                  </span>
                ),
              },
              {
                header: 'Comments',
                key: 'totalComments',
                render: (post) => (
                  <span className="font-mono">
                    {formatNumber(post.totalComments || 0)}
                  </span>
                ),
              },
              {
                header: 'Shares',
                key: 'totalShares',
                render: (post) => (
                  <span className="font-mono">
                    {formatNumber(post.totalShares || 0)}
                  </span>
                ),
              },
              {
                header: 'Eng. Rate',
                key: 'engagementRate',
                render: (post) => (
                  <span className="font-mono">
                    {formatPercentage(post.avgEngagementRate || 0)}
                  </span>
                ),
              },
            ]}
            actions={[
              {
                icon: <HiArrowRight className="w-4 h-4" />,
                onClick: (post) => setSelectedPostId(post.id),
                tooltip: 'View Post Details',
              },
            ]}
          />
        </div>
      </div>

      <PostDetailOverlay
        postId={selectedPostId}
        scope={PageScope.ANALYTICS}
        onClose={() => setSelectedPostId(null)}
      />
    </Container>
  );
}
