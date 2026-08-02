'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant, PageScope } from '@genfeedai/enums';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/interfaces/utils/filters.interface';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import FiltersButton from '@ui/content/filters-button/FiltersButton';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
import { ExternalLink, LayoutGrid, Upload } from 'lucide-react';
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
  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {scope === PageScope.BRAND ? <LibraryAssetTypeFilter /> : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ButtonRefresh onClick={onRefresh} isRefreshing={isRefreshing} />

        <FiltersButton
          filters={filters}
          visibleFilters={config.visibleFilters}
          filterOptions={config.filterOptions}
          onFiltersChange={onFiltersChange}
        />

        {scope !== PageScope.SUPERADMIN && config.showUpload && (
          <Button
            tooltip="Upload"
            icon={<Upload />}
            variant={ButtonVariant.SECONDARY}
            onClick={onUpload}
          />
        )}

        {scope === PageScope.BRAND && (
          <PrimitiveButton
            asChild
            tooltip="Mood board"
            variant={ButtonVariant.SECONDARY}
          >
            <Link href={APP_ROUTES.LIBRARY.MOODBOARD}>
              <LayoutGrid />
              Mood board
            </Link>
          </PrimitiveButton>
        )}

        {/* One-off generation is Agent-first — the standalone Studio
            image/video/avatar/music prompt bars are retired. */}
        {scope !== PageScope.SUPERADMIN && config.showGenerateLink && (
          <PrimitiveButton asChild variant={ButtonVariant.DEFAULT}>
            <Link
              href={`${EnvironmentService.apps.app}/agent/new`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink />
              Generate
            </Link>
          </PrimitiveButton>
        )}
      </div>
    </div>
  );
}
