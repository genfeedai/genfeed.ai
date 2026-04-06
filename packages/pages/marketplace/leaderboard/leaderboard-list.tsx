'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { CardEmptySize } from '@genfeedai/enums';
import type { IPost } from '@genfeedai/interfaces';
import type { Ingredient } from '@models/content/ingredient.model';
import type { Post } from '@models/content/post.model';
import { logger } from '@services/core/logger.service';
import { PublicService } from '@services/external/public.service';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { useSearchParams } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { HiTrophy } from 'react-icons/hi2';

const DEFAULT_RANGE = 'week' as const;

const VIDEO_PLAYER_CONFIG = {
  autoPlay: false,
  controls: true,
  loop: false,
  muted: false,
  playsInline: true,
  preload: 'metadata' as const,
};

export default function LeaderboardList(): ReactNode {
  const searchParams = useSearchParams();
  const page = parseInt(searchParams?.get('page') || '1', 10);

  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const findAllPosts = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setIsLoading(true);

        const publicService = PublicService.getInstance();
        const data = await publicService.findPublicPostsWithSignal(
          {
            limit: ITEMS_PER_PAGE,
            page,
            range: DEFAULT_RANGE,
            sort: 'views: -1',
            type: 'video',
          },
          signal,
        );

        if (signal?.aborted) {
          return;
        }

        setPosts(data as Post[]);
        setIsLoading(false);
      } catch (error) {
        if (signal?.aborted) {
          return;
        }
        logger.error('Failed to fetch posts:', error);
        setIsLoading(false);
      }
    },
    [page],
  );

  useEffect(() => {
    const controller = new AbortController();
    findAllPosts(controller.signal);

    return () => {
      controller.abort();
    };
  }, [findAllPosts]);

  if (isLoading) {
    return <Loading isFullSize={false} />;
  }

  return (
    <Container>
      {posts.length === 0 ? (
        <CardEmpty
          icon={HiTrophy}
          label="No Top Videos Yet"
          description="Share your AI-generated videos to appear on the leaderboard."
          size={CardEmptySize.LG}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {posts.map((post: IPost) => {
            const ingredient = post.ingredients?.[0] as Ingredient;

            return (
              <Card
                key={post.id}
                className="p-4 hover:shadow-lg transition-shadow duration-300"
              >
                <div className="flex flex-col space-y-4">
                  <div className="aspect-video w-full overflow-hidden bg-background">
                    <VideoPlayer
                      src={ingredient.ingredientUrl}
                      thumbnail={ingredient.thumbnailUrl ?? undefined}
                      config={VIDEO_PLAYER_CONFIG}
                    />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold truncate">
                      {post.label || 'Untitled'}
                    </h3>
                    <p className="text-sm text-foreground/70 mt-2">
                      {post.totalViews} views
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-4">
        <AutoPagination />
      </div>
    </Container>
  );
}
