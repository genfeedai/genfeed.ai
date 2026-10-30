'use client';

import { IngredientsProvider } from '@contexts/content/ingredients-context/ingredients-context';
import { IngredientsHeaderProvider } from '@contexts/content/ingredients-header-context/ingredients-header-context';
import { ButtonSize, ButtonVariant, PageScope } from '@genfeedai/contracts';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/contracts/interfaces/utils/filters.interface';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import FiltersSearch from '@ui/content/filters-button/FiltersSearch';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import {
  SHELL_ICON_BUTTON_CLASS,
  SHELL_ICON_CLASS,
} from '@ui-constants/shell-chrome.constant';
import { Image, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { IngredientsLayoutProps } from '@/features/ingredients/props/ingredients-layout.props';

import IngredientsLayoutToolbar from './ingredients-layout-toolbar';
import { useIngredientsLayout } from './use-ingredients-layout';

// The provider only hosts header context for the Library; this layout has
// nothing to publish, so the value is a stable constant.
const HEADER_CONTEXT_VALUE = {};

export default function IngredientsLayout({
  children,
  scope = PageScope.BRAND,
  defaultType,
}: IngredientsLayoutProps) {
  const translateUpload = useTranslations('pages.library.browser.toolbar');
  const {
    config,
    contextValue,
    currentIngredient,
    filters,
    handleFiltersChange,
    handleRefresh,
    handleUpload,
    isRefreshing,
  } = useIngredientsLayout({ scope, defaultType });

  return (
    <IngredientsHeaderProvider value={HEADER_CONTEXT_VALUE}>
      <IngredientsProvider value={contextValue}>
        <Container
          isTopbarPinned
          label={currentIngredient.label}
          leading={
            config.visibleFilters?.search ? (
              <FiltersSearch
                filterOptions={config.filterOptions}
                filters={filters}
                onFiltersChange={(f: IFiltersState, q: IFilters) =>
                  handleFiltersChange(f, q)
                }
                visibleFilters={config.visibleFilters}
              />
            ) : undefined
          }
          icon={Image}
          refresh={
            <ButtonRefresh
              isRefreshing={isRefreshing}
              onClick={handleRefresh}
            />
          }
          iconActions={
            config.showUpload ? (
              <Button
                ariaLabel={translateUpload('upload')}
                className={SHELL_ICON_BUTTON_CLASS}
                icon={<Upload className={SHELL_ICON_CLASS} />}
                onClick={handleUpload}
                size={ButtonSize.ICON}
                tooltip={translateUpload('upload')}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
            ) : undefined
          }
          right={
            <IngredientsLayoutToolbar
              config={config}
              filters={filters}
              onFiltersChange={(f: IFiltersState, q: IFilters) =>
                handleFiltersChange(f, q)
              }
            />
          }
        >
          {children}
        </Container>
      </IngredientsProvider>
    </IngredientsHeaderProvider>
  );
}
