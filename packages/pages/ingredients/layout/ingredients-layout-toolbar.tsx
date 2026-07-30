'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant, PageScope } from '@genfeedai/enums';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/interfaces/utils/filters.interface';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag';
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
  ingredientCategory: string | null;
  isRefreshing: boolean;
  scope: PageScope;
  onRefresh: () => void;
  onFiltersChange: (f: IFiltersState, q: IFilters) => void;
  onUpload: () => void;
};

export default function IngredientsLayoutToolbar({
  config,
  filters,
  ingredientCategory,
  isRefreshing,
  scope,
  onRefresh,
  onFiltersChange,
  onUpload,
}: IngredientsLayoutToolbarProps) {
  const isStudioEnabled = useFeatureFlag('studio');

  return (
    <div className="flex items-center gap-2">
      {scope === PageScope.BRAND ? <LibraryAssetTypeFilter /> : null}

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

      {isStudioEnabled &&
        scope !== PageScope.SUPERADMIN &&
        config.showStudioLink && (
          <PrimitiveButton asChild variant={ButtonVariant.DEFAULT}>
            <Link
              href={`${EnvironmentService.apps.app}/studio/${ingredientCategory?.replace('s', '')?.toLowerCase()}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink />
              Studio
            </Link>
          </PrimitiveButton>
        )}
    </div>
  );
}
