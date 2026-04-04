import { metadata } from '@helpers/media/metadata/metadata.helper';
import IngredientPosts from '@pages/posts/[id]/ingredient-posts';
import {
  getPublicIngredientByIdCached,
  getPublicIngredientPostsPageData,
} from '@public/posts/[id]/posts-loader';
import { EnvironmentService } from '@services/core/environment.service';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import type { Metadata } from 'next';
import { Suspense } from 'react';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const ingredient = await getPublicIngredientByIdCached(id);

  if (!ingredient || ingredient?.id === 'undefined') {
    return {
      description: 'The ingredient you are looking for does not exist.',
      title: `Ingredient not found`,
    };
  }

  const ingredientImage = ingredient.thumbnailUrl || metadata.cards.default;
  const ingredientTitle = ingredient.metadataLabel || 'Ingredient';

  const ingredientUrl = `${EnvironmentService.apps.website}/posts/${id}`;
  const ingredientDescription = `Browse all posts created with ${ingredientTitle}`;

  return {
    alternates: {
      canonical: ingredientUrl,
    },
    description: ingredientDescription,
    openGraph: {
      description: ingredientDescription,
      images: {
        alt: ingredientTitle,
        height: 630,
        type: 'image/jpeg',
        url: ingredientImage,
        width: 1200,
      },
      title: ingredientTitle,
      type: 'website',
      url: ingredientUrl,
    },
    title: `${ingredientTitle} | Posts | ${metadata.name}`,
    twitter: {
      card: 'summary_large_image',
      creator: '@genfeedai',
      description: ingredientDescription,
      images: [ingredientImage],
      title: ingredientTitle,
    },
  };
}

export default async function IngredientPostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page: rawPage } = await searchParams;
  const parsedPage = Number.parseInt(rawPage ?? '1', 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const { ingredient, posts } = await getPublicIngredientPostsPageData(
    id,
    page,
  );

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <IngredientPosts id={id} ingredient={ingredient} posts={posts} />
    </Suspense>
  );
}
