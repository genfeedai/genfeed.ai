'use client';

import { EMPTY_STATES } from '@genfeedai/constants';
import { CardVariant } from '@genfeedai/enums';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import Image from 'next/image';
import Link from 'next/link';
import {
  HiChatBubbleLeftRight,
  HiEye,
  HiHeart,
  HiPhoto,
} from 'react-icons/hi2';

export interface TopPost {
  postId: string;
  label?: string;
  description?: string;
  platform: string;
  brandName?: string;
  brandLogo?: string;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  thumbnailUrl?: string;
  ingredientUrl?: string;
  isVideo?: boolean;
}

export interface TopPostsSectionProps {
  posts: TopPost[];
  isLoading?: boolean;
  basePath?: string;
  className?: string;
}

export default function TopPostsSection({
  posts,
  isLoading = false,
  basePath = '/posts',
  className = '',
}: TopPostsSectionProps) {
  if (isLoading) {
    return (
      <Card
        variant={CardVariant.DEFAULT}
        label="Top Posts"
        className={className}
      >
        <div className="animate-pulse space-y-4">
          <div className="h-48 bg-muted" />
          <div className="grid grid-cols-3 gap-2">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="aspect-square bg-muted" />
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (!posts || posts.length === 0) {
    return (
      <Card
        variant={CardVariant.DEFAULT}
        label="Top Posts"
        className={className}
      >
        <div className="flex flex-col items-center justify-center py-8 text-foreground/60">
          <HiPhoto className="w-12 h-12 mb-2 opacity-50" />
          <p className="text-sm">{EMPTY_STATES.POSTS_PERIOD}</p>
        </div>
      </Card>
    );
  }

  const [featuredPost, ...remainingPosts] = posts;
  const placeholderImage = `${EnvironmentService.assetsEndpoint}/placeholders/square.jpg`;

  return (
    <Card
      label="Top Posts"
      description={`1 of ${posts.length}`}
      className={className}
    >
      <div className="space-y-4">
        {/* Featured Post (#1) */}
        <Link href={`${basePath}/${featuredPost.postId}`} className="block">
          <div className="relative overflow-hidden bg-muted aspect-video group">
            {featuredPost.isVideo && featuredPost.ingredientUrl ? (
              <VideoPlayer
                src={featuredPost.ingredientUrl}
                thumbnail={featuredPost.thumbnailUrl}
                config={{
                  controls: false,
                  loop: true,
                  muted: true,
                  playsInline: true,
                  preload: 'metadata',
                }}
              />
            ) : (
              <Image
                src={
                  featuredPost.thumbnailUrl ||
                  featuredPost.ingredientUrl ||
                  placeholderImage
                }
                alt={featuredPost.label || 'Top post'}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
              />
            )}

            {/* Rank badge */}
            <div className="absolute top-3 left-3 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-bold shadow-lg">
              #1
            </div>

            {/* Platform icon */}
            <div className="absolute top-3 right-3 bg-black/50 p-1.5 rounded-full">
              {getPlatformIcon(featuredPost.platform, 'w-5 h-5 text-white')}
            </div>

            {/* KPIs overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4">
              <h3 className="text-white font-semibold line-clamp-1 mb-2">
                {featuredPost.label ||
                  featuredPost.description?.slice(0, 50) ||
                  'Untitled'}
              </h3>
              <div className="flex items-center gap-4 text-white/90 text-sm">
                <span className="flex items-center gap-1.5">
                  <HiEye className="w-4 h-4" />
                  {formatCompactNumber(featuredPost.totalViews)}
                </span>
                <span className="flex items-center gap-1.5">
                  <HiHeart className="w-4 h-4 text-rose-400" />
                  {formatCompactNumber(featuredPost.totalLikes)}
                </span>
                <span className="flex items-center gap-1.5">
                  <HiChatBubbleLeftRight className="w-4 h-4 text-sky-400" />
                  {formatCompactNumber(featuredPost.totalComments)}
                </span>
              </div>
            </div>
          </div>
        </Link>

        {/* Remaining Posts (2-10) */}
        {remainingPosts.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {remainingPosts.map((post, index) => (
              <Link
                key={post.postId}
                href={`${basePath}/${post.postId}`}
                className="relative group"
              >
                <div className="aspect-square overflow-hidden bg-muted relative">
                  <Image
                    src={
                      post.thumbnailUrl ||
                      post.ingredientUrl ||
                      placeholderImage
                    }
                    alt={post.label || `Post ${index + 2}`}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {/* Rank badge */}
                  <div className="absolute top-1.5 left-1.5 bg-black/70 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                    #{index + 2}
                  </div>
                  {/* Views badge */}
                  <div className="absolute bottom-1.5 right-1.5 bg-black/70 text-white px-2 py-0.5 rounded-full text-xs flex items-center gap-1">
                    <HiEye className="w-3 h-3" />
                    {formatCompactNumber(post.totalViews)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
