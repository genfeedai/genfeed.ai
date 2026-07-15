'use client';

import type { IngredientCategory } from '@genfeedai/enums';
import {
  categoryToParam,
  paramToCategory,
  STUDIO_CATEGORY_CONFIG,
  useEnabledCategories,
} from '@hooks/data/organization/use-enabled-categories/use-enabled-categories';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import StudioGenerateLayout from '@pages/studio/generate';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import Tabs from '@ui/navigation/tabs/Tabs';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import StudioWorkspaceSurfaceAdapter from '../studio-workspace-surface-adapter';
import GenerationFeatureGuard from './GenerationFeatureGuard';

function StudioPageContentInner() {
  const { replace } = useRouter();
  const { href } = useOrgUrl();
  const params = useParams<{ type?: string }>();
  const searchParams = useSearchParams();
  const requestedType = searchParams.get('type');
  const { enabledCategories, isEnabled, defaultCategory, isLoading } =
    useEnabledCategories();
  const hasRedirectedRef = useRef(false);

  // Derive category from URL (single source of truth)
  const category = useMemo(() => {
    const fromPath = params.type;
    if (fromPath) {
      return paramToCategory(fromPath);
    }

    return paramToCategory(requestedType);
  }, [params.type, requestedType]);

  // Redirect to default if current category is disabled
  useEffect(() => {
    if (isLoading || hasRedirectedRef.current) {
      return;
    }

    if (!isEnabled(category)) {
      hasRedirectedRef.current = true;
      replace(`/studio/${categoryToParam(defaultCategory)}`, {
        scroll: false,
      });
    }
  }, [isLoading, category, isEnabled, defaultCategory, replace]);

  // Reset redirect flag on URL change
  useEffect(() => {
    hasRedirectedRef.current = false;
  }, []);

  const handleCategoryChange = useCallback(
    (newCategory: IngredientCategory) => {
      replace(`/studio/${categoryToParam(newCategory)}`, {
        scroll: false,
      });
    },
    [replace],
  );

  const navigationItems = useMemo(
    () =>
      STUDIO_CATEGORY_CONFIG.filter(({ category }) =>
        enabledCategories.includes(category),
      ).map(({ category, param }) => ({
        href: href(`/studio/${param}`),
        id: param,
        label: `${category.charAt(0).toUpperCase()}${category.slice(1)}`,
        matchMode: 'exact' as const,
      })),
    [enabledCategories, href],
  );

  return (
    <div className="flex h-full flex-col">
      <StudioWorkspaceSurfaceAdapter mode={category} />
      <div className="shrink-0 border-border border-b px-4 py-2">
        <Tabs
          items={navigationItems}
          activeTab={categoryToParam(category)}
          fullWidth={false}
          size="sm"
          variant="pills"
        />
      </div>
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
