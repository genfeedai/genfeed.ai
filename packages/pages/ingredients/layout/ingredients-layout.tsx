'use client';

import { IngredientsProvider } from '@contexts/content/ingredients-context/ingredients-context';
import { IngredientsHeaderProvider } from '@contexts/content/ingredients-header-context/ingredients-header-context';
import { ButtonSize, ButtonVariant, PageScope } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/contracts/interfaces/utils/filters.interface';
import { createFilterHref } from '@helpers/navigation/filter-href.helper';
import type { IngredientsLayoutProps } from '@props/content/ingredients-layout.props';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import {
  SHELL_ICON_BUTTON_CLASS,
  SHELL_ICON_CLASS,
} from '@ui-constants/shell-chrome.constant';
import { Image, Upload } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import IngredientsLayoutToolbar from './ingredients-layout-toolbar';
import { useIngredientsLayout } from './use-ingredients-layout';

export default function IngredientsLayout({
  children,
  scope = PageScope.BRAND,
  defaultType,
  hideTypeTabs,
}: IngredientsLayoutProps) {
  const translateUpload = useTranslations('pages.library.browser.toolbar');
  const search = useSearchParams()?.toString() ?? '';
  const typeHref = (type: string) =>
    createFilterHref(
      APP_ROUTES.ADMIN.CONTENT.INGREDIENTS,
      search,
      'assetType',
      type,
    );
  const {
    config,
    contextValue,
    currentIngredient,
    filters,
    handleFiltersChange,
    handleRefresh,
    handleUpload,
    headerMeta,
    isRefreshing,
    setHeaderMeta,
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
          isTopbarPinned
          label={currentIngredient.label}
          description={description}
          icon={Image}
          {...(hideTypeTabs
            ? {}
            : {
                headerTabs: {
                  activeTab: typeHref(
                    [
                      'videos',
                      'images',
                      'gifs',
                      'musics',
                      'avatars',
                      'voices',
                      'ingredients',
                    ].find(
                      (value) =>
                        value === new URLSearchParams(search).get('assetType'),
                    ) ?? 'ingredients',
                  ),
                  fullWidth: false,
                  tabs: [
                    {
                      href: typeHref('ingredients'),
                      label: 'All',
                    },
                    {
                      href: typeHref('videos'),
                      label: 'Videos',
                    },
                    {
                      href: typeHref('images'),
                      label: 'Images',
                    },
                    {
                      href: typeHref('gifs'),
                      label: 'GIFs',
                    },
                    {
                      href: typeHref('musics'),
                      label: 'Music',
                    },
                  ],
                },
              })}
          refresh={
            <ButtonRefresh
              isRefreshing={isRefreshing}
              onClick={handleRefresh}
            />
          }
          iconActions={
            scope !== PageScope.SUPERADMIN && config.showUpload ? (
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
              scope={scope}
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
