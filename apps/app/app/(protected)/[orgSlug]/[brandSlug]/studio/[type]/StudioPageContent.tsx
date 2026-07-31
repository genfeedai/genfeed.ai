'use client';

import type { IngredientCategory } from '@genfeedai/enums';
import {
  categoryToParam,
  paramToCategory,
  useEnabledCategories,
} from '@hooks/data/organization/use-enabled-categories/use-enabled-categories';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import StudioGenerateLayout from '@pages/studio/generate';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import StudioWorkspaceSurfaceAdapter from '../studio-workspace-surface-adapter';
import GenerationFeatureGuard from './GenerationFeatureGuard';

type StudioPageContentProps = {
  /** Org catch-all routes pass type via segments, not `params.type`. */
  typeOverride?: string | null;
};

function StudioPageContentInner({ typeOverride }: StudioPageContentProps) {
  const { replace } = useRouter();
  const { href } = useOrgUrl();
  const params = useParams<{
    segments?: string | string[];
    type?: string;
  }>();
  const searchParams = useSearchParams();
  const requestedType = searchParams.get('type');
  const { isEnabled, defaultCategory, isLoading } = useEnabledCategories();
  const hasRedirectedRef = useRef(false);

  const segmentType = useMemo(() => {
    if (Array.isArray(params.segments)) {
      return params.segments[0];
    }
    return params.segments;
  }, [params.segments]);

  // Derive category from URL (single source of truth)
  const category = useMemo(() => {
    const fromPath = typeOverride ?? params.type ?? segmentType;
    if (fromPath) {
      return paramToCategory(fromPath);
    }

    return paramToCategory(requestedType);
  }, [params.type, requestedType, segmentType, typeOverride]);

  const studioPath = useCallback(
    (nextCategory: IngredientCategory) =>
      href(`/studio/${categoryToParam(nextCategory)}`),
    [href],
  );

  // Redirect to default if current category is disabled
  useEffect(() => {
    if (isLoading || hasRedirectedRef.current) {
      return;
    }

    if (!isEnabled(category)) {
      hasRedirectedRef.current = true;
      replace(studioPath(defaultCategory), {
        scroll: false,
      });
    }
  }, [isLoading, category, isEnabled, defaultCategory, replace, studioPath]);

  // Reset redirect flag on URL change
  useEffect(() => {
    hasRedirectedRef.current = false;
  }, []);

  const handleCategoryChange = useCallback(
    (newCategory: IngredientCategory) => {
      replace(studioPath(newCategory), {
        scroll: false,
      });
    },
    [replace, studioPath],
  );

  return (
    <div className="flex h-full flex-col">
      <StudioWorkspaceSurfaceAdapter mode={category} />
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

export default function StudioPageContent({
  typeOverride,
}: StudioPageContentProps) {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <StudioPageContentInner typeOverride={typeOverride} />
    </Suspense>
  );
}
