'use client';

import { ButtonVariant, PageScope } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/contracts/interfaces/utils/filters.interface';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import FiltersButton from '@ui/content/filters-button/FiltersButton';
import { Button as PrimitiveButton } from '@ui/primitives/button';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';

import type { IngredientsLayoutConfig } from './ingredients-layout.config';
import LibraryAssetTypeFilter from './library-asset-type-filter';

type IngredientsLayoutToolbarProps = {
  config: IngredientsLayoutConfig;
  filters: IFiltersState;
  scope: PageScope;
  onFiltersChange: (f: IFiltersState, q: IFilters) => void;
};

export default function IngredientsLayoutToolbar({
  config,
  filters,
  scope,
  onFiltersChange,
}: IngredientsLayoutToolbarProps) {
  const { href } = useOrgUrl();

  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {scope !== PageScope.SUPERADMIN ? <LibraryAssetTypeFilter /> : null}
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
      </div>
    </div>
  );
}
