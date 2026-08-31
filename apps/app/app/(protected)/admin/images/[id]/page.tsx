import IngredientDetail from '@pages/ingredients/detail/ingredient-detail';
import type { IngredientDetailPageProps } from '@props/content/ingredient.props';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import type { Metadata } from 'next';
import { Suspense } from 'react';

export async function generateMetadata(): Promise<Metadata> {
  return {
    description: `View details for image ingredient`,
    title: `Ingredient Detail - Image`,
  };
}

export default async function IngredientDetailPage({
  params,
}: IngredientDetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<PageLoadingState />}>
      <IngredientDetail type={'images'} id={id} />
    </Suspense>
  );
}
