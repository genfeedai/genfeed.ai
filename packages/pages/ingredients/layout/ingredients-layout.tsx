'use client';

import { IngredientsProvider } from '@contexts/content/ingredients-context/ingredients-context';
import { IngredientsHeaderProvider } from '@contexts/content/ingredients-header-context/ingredients-header-context';
import { PageScope } from '@genfeedai/contracts';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/contracts/interfaces/utils/filters.interface';
import type { IngredientsLayoutProps } from '@props/content/ingredients-layout.props';
import Container from '@ui/layout/container/Container';
import { Image } from 'lucide-react';
import { useMemo } from 'react';

import IngredientsLayoutToolbar from './ingredients-layout-toolbar';
import { useIngredientsLayout } from './use-ingredients-layout';

export default function IngredientsLayout({
  children,
  scope = PageScope.BRAND,
  defaultType,
  hideTypeTabs,
}: IngredientsLayoutProps) {
  const {
    config,
    contextValue,
    currentIngredient,
    filters,
    handleFiltersChange,
    handleRefresh,
    handleUpload,
    headerMeta,
    ingredientType,
    isRefreshing,
    setHeaderMeta,
    setIngredientType,
  } = useIngredientsLayout({ scope, defaultType });

  const description = headerMeta ? (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>{currentIngredient.description}</span>
      <span className="text-foreground/50" aria-hidden="true">
        •
      </span>
      <span className="text-foreground/70">{headerMeta}</span>
    </div>
  ) : (
    currentIngredient.description
  );

  // Stable context identity — avoid `value={{ ... }}` inline objects that
  // force every consumer to re-render (and can remount list chrome) on each
  // parent pass, even when setHeaderMeta itself is stable.
  const headerContextValue = useMemo(
    () => ({ headerMeta, setHeaderMeta }),
    [headerMeta, setHeaderMeta],
  );

  return (
    <IngredientsHeaderProvider value={headerContextValue}>
      <IngredientsProvider value={contextValue}>
        <Container
          label={currentIngredient.label}
          description={description}
          icon={Image}
          {...(hideTypeTabs
            ? {}
            : {
                activeTab: ingredientType,
                onTabChange: setIngredientType,
                tabs: [
                  { id: 'videos', label: 'Videos' },
                  { id: 'images', label: 'Images' },
                  { id: 'gifs', label: 'GIFs' },
                  { id: 'musics', label: 'Music' },
                ],
              })}
          right={
            <IngredientsLayoutToolbar
              config={config}
              filters={filters}
              isRefreshing={isRefreshing}
              scope={scope}
              onRefresh={handleRefresh}
              onFiltersChange={(f: IFiltersState, q: IFilters) =>
                handleFiltersChange(f, q)
              }
              onUpload={handleUpload}
            />
          }
        >
          {children}
        </Container>
      </IngredientsProvider>
    </IngredientsHeaderProvider>
  );
}
