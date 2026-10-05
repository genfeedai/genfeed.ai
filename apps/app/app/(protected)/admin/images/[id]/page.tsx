import IngredientDetailRoute from '@app/(protected)/admin/images/[id]/IngredientDetailRoute';
import type { Metadata } from 'next';
import { Suspense } from 'react';

export async function generateMetadata(): Promise<Metadata> {
  return {
    description: `View details for image ingredient`,
    title: `Ingredient Detail - Image`,
  };
}

export default function IngredientDetailPage() {
  return (
    <Suspense fallback={null}>
      <IngredientDetailRoute />
    </Suspense>
  );
}
