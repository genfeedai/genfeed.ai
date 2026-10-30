import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import type {
  ModalityFilterValue,
  SourceFilterValue,
  StageFilterValue,
} from '@props/settings/skill-filters.props';
import FilterMenu from '@ui/content/filter-menu/FilterMenu';
import SearchField from '@ui/content/search-field/SearchField';
import { Button } from '@ui/primitives/button';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type {
  SkillAgentActionProps,
  SkillSearchProps,
} from '@/features/settings/props/skills.props';

import {
  MODALITY_FILTERS,
  SOURCE_FILTERS,
  STAGE_FILTERS,
} from './skill-filter-options';

/** The skills search, with the Source / Modality / Stage Filters menu inside it. */
export function SkillSearch({
  modalityFilter,
  onModalityFilterChange,
  onSearchQueryChange,
  onSourceFilterChange,
  onStageFilterChange,
  searchQuery,
  sourceFilter,
  stageFilter,
}: SkillSearchProps) {
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
    <SearchField
      ariaLabel={translate('filters.search.label')}
      onChange={(event) => onSearchQueryChange(event.target.value)}
      placeholder={translate('filters.search.placeholder')}
      value={searchQuery}
    >
      <FilterMenu
        allLabel={translate('filters.all')}
        clearLabel={translate('filters.clear')}
        facets={facets}
        getActiveCountLabel={(count) =>
          translate('filters.activeCount', { count })
        }
        isAttached
        label={translate('filters.menu')}
        onClear={() => {
          onSourceFilterChange('all');
          onModalityFilterChange('all');
          onStageFilterChange('all');
        }}
      />
    </SearchField>
  );
}

export default function SkillAgentAction({ agentHref }: SkillAgentActionProps) {
  const translate = useTranslations('common.settings.skills');

  return (
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
  );
}
