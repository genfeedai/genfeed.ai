'use client';

import { ButtonVariant, ModalEnum, PageScope } from '@genfeedai/contracts';
import type { IFiltersState } from '@genfeedai/contracts/interfaces/utils/filters.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import type { ITagsPageProps } from '@props/admin/tags.props';
import FiltersButton from '@ui/content/filters-button/FiltersButton';
import { Button } from '@ui/primitives/button';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import TagsLayout from './tags-layout';
import TagsList from './tags-list';

function handleAddTag() {
  openModal(ModalEnum.TAG);
}

export default function TagsPage({ scope, filter }: ITagsPageProps) {
  const [filters, setFilters] = useState<IFiltersState>({
    format: '',
    model: '',
    provider: '',
    search: '',
    sort: 'createdAt',
    status: '',
    type: '',
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <TagsLayout
      scope={scope}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
      filters={
        <FiltersButton
          filters={filters}
          visibleFilters={{
            format: false,
            model: false,
            provider: false,
            search: true,
            sort: true,
            status: false,
            type: true,
          }}
          onFiltersChange={(f: IFiltersState) => {
            setFilters(f);
          }}
        />
      }
      primaryAction={
        scope === PageScope.SUPERADMIN ? (
          <Button
            variant={ButtonVariant.DEFAULT}
            onClick={handleAddTag}
            icon={<Plus />}
            label="Tag"
          />
        ) : undefined
      }
    >
      <TagsList
        scope={scope}
        filter={filter}
        externalFilters={filters}
        refreshTrigger={refreshTrigger}
        onRefreshingChange={setIsRefreshing}
      />
    </TagsLayout>
  );
}
