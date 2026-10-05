import IngredientDetailRoute from '@app/(protected)/admin/videos/[id]/IngredientDetailRoute';
import type { Metadata } from 'next';
import { Suspense } from 'react';

export async function generateMetadata(): Promise<Metadata> {
  return {
    description: `View details for video ingredient`,
    title: `Ingredient Detail - Video`,
  };
}

export default function IngredientDetailPage() {
  return (
    <Suspense fallback={null}>
      <IngredientDetailRoute />
    </Suspense>
  );
}
