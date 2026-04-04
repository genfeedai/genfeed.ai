import { EMPTY_STATES } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { getPublisherPostsHref } from '@helpers/content/posts.helper';
import type { Ingredient } from '@models/content/ingredient.model';
import type { Post } from '@models/content/post.model';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import HtmlContent from '@ui/display/html-content/HtmlContent';
import Container from '@ui/layout/container/Container';
import AppLink from '@ui/navigation/link/Link';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import Image from 'next/image';
import {
  HiArrowLeft,
  HiDocumentText,
  HiEye,
  HiOutlinePhoto,
} from 'react-icons/hi2';

export interface IngredientPostsProps {
  id: string;
  ingredient: Ingredient | null;
  posts: Post[];
}

export default function IngredientPosts({
  id,
  ingredient,
  posts,
}: IngredientPostsProps) {
  if (!ingredient || ingredient?.id === 'undefined') {
    return (
      <Container>
        <CardEmpty
          label="Ingredient not found"
          description="The ingredient you are looking for does not exist."
        />
      </Container>
    );
  }

  const ingredientMetrics = ingredient as Ingredient & {
    totalPosts?: number;
    totalViews?: number;
  };

  return (
    <Container>
      {/* Back button */}
      <div className="mb-6">
        <AppLink
          url={getPublisherPostsHref()}
          icon={<HiArrowLeft />}
          label="Back to ingredients"
          variant={ButtonVariant.GHOST}
        />
      </div>

      {/* Ingredient header */}
      <div className="mb-8 flex flex-col md:flex-row gap-6 items-start">
        {/* Thumbnail */}
        <div className="relative w-32 h-32 bg-background overflow-hidden flex-shrink-0">
          {ingredient.thumbnailUrl ? (
            <Image
              src={ingredient.thumbnailUrl}
              alt={ingredient.metadataLabel || 'Ingredient'}
              fill
              className="object-cover"
              sizes="128px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <HiOutlinePhoto className="text-4xl text-foreground/20" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1">
          <h1 className="text-3xl font-bold mb-2">
            {ingredient.metadataLabel || 'Untitled Ingredient'}
          </h1>

          {ingredient.metadataDescription && (
            <p className="text-foreground/70 mb-4">
              {ingredient.metadataDescription}
            </p>
          )}

          {/* Metrics */}
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <HiDocumentText className="text-xl text-primary" />
              <span className="font-medium">
                {ingredientMetrics.totalPosts || 0} posts
              </span>
            </div>

            <div className="flex items-center gap-2">
              <HiEye className="text-xl text-primary" />
              <span className="font-medium">
                {ingredientMetrics.totalViews || 0} views
              </span>
            </div>
          </div>

          {/* Category */}
          {ingredient.category && (
            <div className="mt-4">
              <span className="inline-block px-3 py-1 text-sm font-medium rounded-full bg-primary/10 text-primary capitalize">
                {ingredient.category}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Posts grid */}
      {posts.length === 0 ? (
        <CardEmpty
          label={EMPTY_STATES.POSTS_YET}
          description="This ingredient hasn't been used in any public posts yet."
        />
      ) : (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Posts using this ingredient</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {posts.map((post) => (
              <Card
                key={post.id}
                className="p-4 hover:shadow-lg transition-shadow duration-300"
              >
                <div className="flex flex-col space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold truncate flex-1">
                      {post.label || 'Untitled Post'}
                    </h3>
                  </div>

                  {post.description && (
                    <HtmlContent
                      content={post.description}
                      className="line-clamp-3 text-sm text-foreground/60"
                    />
                  )}

                  <div className="flex items-center gap-2 text-xs text-foreground/50">
                    {post.platform && (
                      <span className="capitalize">{post.platform}</span>
                    )}
                    {(post.totalViews ?? 0) > 0 && (
                      <>
                        <span>•</span>
                        <span>{post.totalViews} views</span>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="mt-6">
            <AutoPagination />
          </div>
        </div>
      )}
    </Container>
  );
}
