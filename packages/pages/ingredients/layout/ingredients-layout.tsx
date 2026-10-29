'use client';

import { IngredientsProvider } from '@contexts/content/ingredients-context/ingredients-context';
import { IngredientsHeaderProvider } from '@contexts/content/ingredients-header-context/ingredients-header-context';
import { ButtonSize, ButtonVariant, PageScope } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/contracts/interfaces/utils/filters.interface';
import { createPathViewHref } from '@helpers/navigation/filter-href.helper';
import type { IngredientsLayoutProps } from '@props/content/ingredients-layout.props';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import {
  SHELL_ICON_BUTTON_CLASS,
  SHELL_ICON_CLASS,
} from '@ui-constants/shell-chrome.constant';
import { Image, Upload } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import IngredientsLayoutToolbar from './ingredients-layout-toolbar';
import { useIngredientsLayout } from './use-ingredients-layout';

// The provider only hosts header context for the Library; this layout has
// nothing to publish, so the value is a stable constant.
const HEADER_CONTEXT_VALUE = {};

const ALL_ASSETS_TYPE = 'ingredients';
const ADMIN_ASSET_TYPES = [
  'videos',
  'images',
  'gifs',
  'musics',
  'avatars',
  'voices',
];

export default function IngredientsLayout({
  children,
  scope = PageScope.BRAND,
  defaultType,
  hideTypeTabs,
}: IngredientsLayoutProps) {
  const translateUpload = useTranslations('pages.library.browser.toolbar');
  const translateTabs = useTranslations('pages.library.browser.assetTypeTabs');
  const search = useSearchParams()?.toString() ?? '';
  const pathname = usePathname() ?? '';
  const typeHref = (type: string) =>
    createPathViewHref(
      type === ALL_ASSETS_TYPE
        ? APP_ROUTES.ADMIN.CONTENT.INGREDIENTS
        : `${APP_ROUTES.ADMIN.CONTENT.INGREDIENTS}/${type}`,
      search,
      'assetType',
    );
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
          icon={Image}
          {...(hideTypeTabs
            ? {}
            : {
                headerTabs: {
                  activeTab: typeHref(
                    ADMIN_ASSET_TYPES.find(
                      (value) =>
                        pathname ===
                        `${APP_ROUTES.ADMIN.CONTENT.INGREDIENTS}/${value}`,
                    ) ?? ALL_ASSETS_TYPE,
                  ),
                  fullWidth: false,
                  tabs: [
                    {
                      href: typeHref('ingredients'),
                      label: translateTabs('all'),
                    },
                    {
                      href: typeHref('videos'),
                      label: translateTabs('videos'),
                    },
                    {
                      href: typeHref('images'),
                      label: translateTabs('images'),
                    },
                    {
                      href: typeHref('gifs'),
                      label: translateTabs('gifs'),
                    },
                    {
                      href: typeHref('musics'),
                      label: translateTabs('music'),
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
