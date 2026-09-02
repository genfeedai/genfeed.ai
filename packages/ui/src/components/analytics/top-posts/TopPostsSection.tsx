'use client';

import { CardVariant } from '@genfeedai/contracts';
import { EMPTY_STATES } from '@genfeedai/contracts/constants';
import { formatCompactNumber } from '@genfeedai/helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@genfeedai/helpers/ui/platform-icon/platform-icon.helper';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import Card from '@ui/card/Card';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Eye, Heart, ImageIcon, MessageSquare } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

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
  basePath = '/publishing',
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
            {Array.from({ length: 9 }, (_, placeholderIndex) => {
              const placeholderId = `top-post-placeholder-${placeholderIndex}`;

              return (
                <div key={placeholderId} className="aspect-square bg-muted" />
              );
            })}
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
          <ImageIcon className="size-12 mb-2 opacity-50" />
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
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover group-hover:scale-105 transition-transform duration-300"
              />
            )}

            {/* Rank badge */}
            <div className="absolute top-3 left-3 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-bold shadow-border">
              #1
            </div>

            {/* Platform icon */}
            <div
              className={
                'absolute right-3 top-3 rounded-full bg-black/50 p-1.5' /* design-system-allow-content-color -- media overlay */
              }
            >
              {getPlatformIcon(
                featuredPost.platform,
                'size-5 text-white', // design-system-allow-content-color -- media overlay
              )}
            </div>

            {/* KPIs overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4">
              <h3
                className={
                  'mb-2 line-clamp-1 font-semibold text-white' /* design-system-allow-content-color -- media overlay */
                }
              >
                {featuredPost.label ||
                  featuredPost.description?.slice(0, 50) ||
                  'Untitled'}
              </h3>
              <div
                className={
                  'flex items-center gap-4 text-sm text-white/90' /* design-system-allow-content-color -- media overlay */
                }
              >
                <span className="flex items-center gap-1.5">
                  <Eye className="size-4" />
                  {formatCompactNumber(featuredPost.totalViews)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Heart className="size-4" />
                  {formatCompactNumber(featuredPost.totalLikes)}
                </span>
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="size-4" />
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
                    sizes="(max-width: 768px) 33vw, 160px"
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {/* Rank badge */}
                  <div
                    className={
                      'absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-white' /* design-system-allow-content-color -- media overlay */
                    }
                  >
                    #{index + 2}
                  </div>
                  {/* Views badge */}
                  <div
                    className={
                      'absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white' /* design-system-allow-content-color -- media overlay */
                    }
                  >
                    <Eye className="size-3" />
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
