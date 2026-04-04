'use client';

import { IngredientCategory } from '@genfeedai/enums';
import {
  categoryToParam,
  paramToCategory,
  useEnabledCategories,
} from '@hooks/data/organization/use-enabled-categories/use-enabled-categories';
import StudioGenerateLayout from '@pages/studio/generate';
import GenerationFeatureGuard from '@pages/studio/guards/GenerationFeatureGuard';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';

function StudioPageContentInner() {
  const router = useRouter();
  const params = useParams<{ type?: string }>();
  const searchParams = useSearchParams();
  const { isEnabled, defaultCategory, isLoading } = useEnabledCategories();
  const hasRedirectedRef = useRef(false);

  // Derive category from URL (single source of truth)
  const category = useMemo(() => {
    const fromPath = params.type;
    if (fromPath) {
      return paramToCategory(fromPath);
    }

    return paramToCategory(searchParams.get('type'));
  }, [params.type, searchParams]);

  // Redirect to default if current category is disabled
  useEffect(() => {
    if (isLoading || hasRedirectedRef.current) {
      return;
    }

    if (!isEnabled(category)) {
      hasRedirectedRef.current = true;
      router.replace(`/studio/${categoryToParam(defaultCategory)}`, {
        scroll: false,
      });
    }
  }, [isLoading, category, isEnabled, defaultCategory, router]);

  // Reset redirect flag on URL change
  useEffect(() => {
    hasRedirectedRef.current = false;
  }, [category]);

  const handleCategoryChange = useCallback(
    (newCategory: IngredientCategory) => {
      router.replace(`/studio/${categoryToParam(newCategory)}`, {
        scroll: false,
      });
    },
    [router],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <GenerationFeatureGuard category={category}>
          <StudioGenerateLayout
            key={category}
            defaultCategoryType={category}
            onCategoryChange={handleCategoryChange}
          />
        </GenerationFeatureGuard>
      </div>
    </div>
  );
}

export default function StudioPageContent() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <StudioPageContentInner />
    </Suspense>
  );
}
