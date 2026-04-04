import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import PostsIngredientsList from '@pages/posts/ingredients/posts-ingredients-list';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadataWithCanonical(
  'Posts by Ingredient',
  'Browse AI-generated content organized by ingredient. Discover how different AI models and templates produce professional marketing content.',
  '/posts',
);

export default function PostsByIngredientsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <PostsIngredientsList />
    </Suspense>
  );
}
