'use client';

import { ButtonVariant, PageScope } from '@genfeedai/enums';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/interfaces/utils/filters.interface';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import FiltersButton from '@ui/content/filters-button/FiltersButton';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
import Link from 'next/link';
import { HiArrowTopRightOnSquare, HiArrowUpTray } from 'react-icons/hi2';
import type { IngredientsLayoutConfig } from './ingredients-layout.config';

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
  return (
    <div className="flex items-center gap-2">
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
          icon={<HiArrowUpTray />}
          variant={ButtonVariant.SECONDARY}
          onClick={onUpload}
        />
      )}

      {scope !== PageScope.SUPERADMIN && config.showStudioLink && (
        <PrimitiveButton asChild variant={ButtonVariant.DEFAULT}>
          <Link
            href={`${EnvironmentService.apps.app}/studio/${ingredientCategory?.replace('s', '')?.toLowerCase()}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <HiArrowTopRightOnSquare />
            Studio
          </Link>
        </PrimitiveButton>
      )}
    </div>
  );
}
