'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import type { Ingredient } from '@models/content/ingredient.model';
import { logger } from '@services/core/logger.service';
import { PublicService } from '@services/external/public.service';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { HiDocumentText, HiEye, HiOutlinePhoto } from 'react-icons/hi2';

// ingredients list with posts to load in the public gallery

export default function PostsIngredientsList() {
  const searchParams = useSearchParams();
  const page = parseInt(searchParams?.get('page') || '1', 10);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const findAllIngredients = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setIsLoading(true);

        const publicService = PublicService.getInstance();
        const data = await publicService.findPublicIngredients({
          limit: ITEMS_PER_PAGE,
          page,
          sort: 'createdAt: -1',
        });

        if (signal?.aborted) {
          return;
        }

        setIngredients(data);
        setIsLoading(false);
      } catch (error) {
        logger.error('Failed to fetch ingredients:', error);
        setIsLoading(false);
      }
    },
    [page],
  );

  useEffect(() => {
    const abortController = new AbortController();

    // Defer the call to avoid synchronous setState in effect
    queueMicrotask(() => {
      findAllIngredients(abortController.signal);
    });

    return () => {
      abortController.abort();
    };
  }, [findAllIngredients]);

  if (isLoading) {
    return <Loading isFullSize={false} />;
  }

  return (
    <Container
      label="Posts by Ingredient"
      description="Content organized by ingredient."
      icon={HiOutlinePhoto}
    >
      {ingredients.length === 0 ? (
        <CardEmpty label="No ingredients available" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {ingredients.map((ingredient) => (
            <Link
              key={ingredient.id}
              href={`/posts/${ingredient.id}`}
              className="block"
            >
              <Card className="p-0 hover:shadow-lg transition-shadow duration-300 overflow-hidden group">
                {/* Thumbnail */}
                <div className="relative w-full aspect-square bg-background overflow-hidden">
                  {ingredient.thumbnailUrl ? (
                    <Image
                      src={ingredient.thumbnailUrl}
                      alt={ingredient.metadataLabel || 'Ingredient thumbnail'}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <HiOutlinePhoto className="text-6xl text-foreground/20" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="font-semibold truncate text-base mb-2">
                    {ingredient.metadataLabel || 'Untitled'}
                  </h3>

                  {/* Metrics */}
                  <div className="flex items-center gap-4 text-sm text-foreground/60">
                    <div className="flex items-center gap-2">
                      <HiDocumentText className="text-base" />
                      <span>{(ingredient as any).totalPosts || 0} posts</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <HiEye className="text-base" />
                      <span>{(ingredient as any).totalViews || 0} views</span>
                    </div>
                  </div>

                  {/* Category badge */}
                  {ingredient.category && (
                    <div className="mt-3">
                      <span className="inline-block px-2 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary capitalize">
                        {ingredient.category}
                      </span>
                    </div>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-4">
        <AutoPagination />
      </div>
    </Container>
  );
}
