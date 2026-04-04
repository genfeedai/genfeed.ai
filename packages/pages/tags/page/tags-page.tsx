'use client';

import type { IFiltersState } from '@genfeedai/interfaces/utils/filters.interface';
import { ButtonVariant, ModalEnum } from '@genfeedai/enums';
import { openModal } from '@helpers/ui/modal/modal.helper';
import TagsLayout from '@pages/tags/layout/tags-layout';
import TagsList from '@pages/tags/list/tags-list';
import type { ContentProps } from '@props/layout/content.props';
import Button from '@ui/buttons/base/Button';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import FiltersButton from '@ui/content/filters-button/FiltersButton';
import { PageScope } from '@ui-constants/misc.constant';
import { useState } from 'react';
import { HiPlus } from 'react-icons/hi2';

export interface ITagsPageProps {
  scope: ContentProps['scope'];
  filter: 'all' | 'default' | 'organization' | 'account';
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
    // Reset after a short delay
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleAddTag = () => {
    openModal(ModalEnum.TAG);
  };

  const rightActions = (
    <>
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

      <ButtonRefresh onClick={handleRefresh} isRefreshing={isRefreshing} />

      {scope === PageScope.SUPERADMIN && (
        <Button
          variant={ButtonVariant.DEFAULT}
          onClick={handleAddTag}
          icon={<HiPlus />}
          label="Tag"
        />
      )}
    </>
  );

  return (
    <TagsLayout scope={scope} rightActions={rightActions}>
      <TagsList
        scope={scope}
        filter={filter}
        externalFilters={filters}
        refreshTrigger={refreshTrigger}
      />
    </TagsLayout>
  );
}
