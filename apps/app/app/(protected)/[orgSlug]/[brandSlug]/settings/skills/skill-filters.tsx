import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import type {
  ModalityFilterValue,
  SourceFilterValue,
  StageFilterValue,
} from '@props/settings/skill-filters.props';
import type { SkillFiltersProps } from '@props/settings/skills.props';
import FilterMenu from '@ui/content/filter-menu/FilterMenu';
import { Button } from '@ui/primitives/button';
import { fieldControlClassName } from '@ui/primitives/field-control';
import FormSearchbar from '@ui/primitives/searchbar';
import { RefreshCw, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import {
  MODALITY_FILTERS,
  SOURCE_FILTERS,
  STAGE_FILTERS,
} from './skill-filter-options';

export default function SkillFilters({
  agentHref,
  modalityFilter,
  onModalityFilterChange,
  onRefresh,
  onSearchQueryChange,
  onSourceFilterChange,
  onStageFilterChange,
  searchQuery,
  sourceFilter,
  stageFilter,
}: SkillFiltersProps) {
  const translate = useTranslations('common.settings.skills');

  const facets: FilterMenuFacet[] = [
    {
      defaultValue: 'all',
      key: 'source',
      label: translate('filters.source.menuLabel'),
      onChange: (value) => onSourceFilterChange(value as SourceFilterValue),
      options: SOURCE_FILTERS.map((filter) => ({
        label: translate(`filters.source.${filter.labelKey}`),
        value: filter.value,
      })),
      selection: 'single',
      value: sourceFilter,
    },
    {
      defaultValue: 'all',
      key: 'modality',
      label: translate('filters.modality.menuLabel'),
      onChange: (value) => onModalityFilterChange(value as ModalityFilterValue),
      options: MODALITY_FILTERS.map((filter) => ({
        label: translate(`filters.modality.${filter.labelKey}`),
        value: filter.value,
      })),
      selection: 'single',
      value: modalityFilter,
    },
    {
      defaultValue: 'all',
      key: 'stage',
      label: translate('filters.stage.menuLabel'),
      onChange: (value) => onStageFilterChange(value as StageFilterValue),
      options: STAGE_FILTERS.map((filter) => ({
        label: translate(`filters.stage.${filter.labelKey}`),
        value: filter.value,
      })),
      selection: 'single',
      value: stageFilter,
    },
  ];

  return (
    <div className="flex flex-wrap items-center justify-end gap-2.5">
      <FormSearchbar
        ariaLabel={translate('filters.search.label')}
        className="w-48"
        inputClassName={`${fieldControlClassName} pl-10 pr-8`}
        onChange={(event) => onSearchQueryChange(event.target.value)}
        placeholder={translate('filters.search.placeholder')}
        size={ComponentSize.SM}
        value={searchQuery}
      />

      <FilterMenu
        allLabel={translate('filters.all')}
        clearLabel={translate('filters.clear')}
        facets={facets}
        getActiveCountLabel={(count) =>
          translate('filters.activeCount', { count })
        }
        label={translate('filters.menu')}
        onClear={() => {
          onSourceFilterChange('all');
          onModalityFilterChange('all');
          onStageFilterChange('all');
        }}
      />

      <Button
        icon={<RefreshCw className="size-4" />}
        label={translate('actions.refresh')}
        onClick={onRefresh}
        size={ButtonSize.SM}
        variant={ButtonVariant.SECONDARY}
      />
      <Button
        asChild
        size={ButtonSize.SM}
        variant={ButtonVariant.DEFAULT}
        withWrapper={false}
      >
        <Link href={agentHref}>
          <Sparkles className="size-4" />
          {translate('actions.openAgent')}
        </Link>
      </Button>
    </div>
  );
}
