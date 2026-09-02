'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant, PageScope } from '@genfeedai/enums';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/interfaces/utils/filters.interface';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import FiltersButton from '@ui/content/filters-button/FiltersButton';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
import {
  SHELL_ICON_BUTTON_CLASS,
  SHELL_ICON_CLASS,
} from '@ui-constants/shell-chrome.constant';
import { ExternalLink, Upload } from 'lucide-react';
import Link from 'next/link';

import type { IngredientsLayoutConfig } from './ingredients-layout.config';
import LibraryAssetTypeFilter from './library-asset-type-filter';

type IngredientsLayoutToolbarProps = {
  config: IngredientsLayoutConfig;
  filters: IFiltersState;
  isRefreshing: boolean;
  scope: PageScope;
  onRefresh: () => void;
  onFiltersChange: (f: IFiltersState, q: IFilters) => void;
  onUpload: () => void;
};

export default function IngredientsLayoutToolbar({
  config,
  filters,
  isRefreshing,
  scope,
  onRefresh,
  onFiltersChange,
  onUpload,
}: IngredientsLayoutToolbarProps) {
  const { href } = useOrgUrl();

  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {scope === PageScope.BRAND ? <LibraryAssetTypeFilter /> : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <FiltersButton
          filters={filters}
          visibleFilters={config.visibleFilters}
          filterOptions={config.filterOptions}
          onFiltersChange={onFiltersChange}
        />

        {/* One-off generation is Agent-first — the standalone Studio
            image/video/avatar/music prompt bars are retired. */}
        {scope !== PageScope.SUPERADMIN && config.showGenerateLink ? (
          <PrimitiveButton asChild variant={ButtonVariant.DEFAULT}>
            <Link href={href(APP_ROUTES.AGENT.NEW)}>
              <ExternalLink />
              Generate
            </Link>
          </PrimitiveButton>
        ) : null}

        <div className="flex items-center gap-1">
          <ButtonRefresh onClick={onRefresh} isRefreshing={isRefreshing} />
          {scope !== PageScope.SUPERADMIN && config.showUpload ? (
            <Button
              ariaLabel="Upload"
              className={SHELL_ICON_BUTTON_CLASS}
              icon={<Upload className={SHELL_ICON_CLASS} />}
              onClick={onUpload}
              size={ButtonSize.ICON}
              tooltip="Upload"
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
