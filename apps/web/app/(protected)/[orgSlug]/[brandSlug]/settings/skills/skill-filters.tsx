import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import SearchField from '@ui/content/search-field/SearchField';
import FilterMenu from '@ui/navigation/filter-menu/FilterMenu';
import { Button } from '@ui/primitives/button';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useIsAppAvailable } from '@/components/shell/use-available-rail-apps';
import type {
  SkillAgentActionProps,
  SkillSearchProps,
} from '@/features/settings/props/skills.props';
import type {
  ModalityFilterValue,
  RunsOnFilterValue,
  SourceFilterValue,
  StageFilterValue,
} from '@/props/settings/skill-filters.props';

import {
  MODALITY_FILTERS,
  RUNS_ON_FILTERS,
  SOURCE_FILTERS,
  STAGE_FILTERS,
} from './skill-filter-options';

/** The skills search, with the Runs on / Source / Modality / Stage Filters menu inside it. */
export function SkillSearch({
  modalityFilter,
  onModalityFilterChange,
  onRunsOnFilterChange,
  onSearchQueryChange,
  onSourceFilterChange,
  onStageFilterChange,
  runsOnFilter,
  searchQuery,
  sourceFilter,
  stageFilter,
}: SkillSearchProps) {
  const translate = useTranslations('common.settings.skills');

  const facets: FilterMenuFacet[] = [
    {
      defaultValue: 'all',
      key: 'runsOn',
      label: translate('filters.runsOn.menuLabel'),
      onChange: (value) => onRunsOnFilterChange(value as RunsOnFilterValue),
      options: RUNS_ON_FILTERS.map((filter) => ({
        label: translate(`filters.runsOn.${filter.labelKey}`),
        value: filter.value,
      })),
      selection: 'single',
      value: runsOnFilter,
    },
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
          onRunsOnFilterChange('all');
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
  const isAgentAvailable = useIsAppAvailable('agent');

  if (!isAgentAvailable) {
    return null;
  }

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
