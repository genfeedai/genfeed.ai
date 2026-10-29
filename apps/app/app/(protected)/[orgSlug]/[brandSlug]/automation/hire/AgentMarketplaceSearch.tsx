import { CONTENT_TEAM_ROLE_PRESETS } from '@pages/agents/content-team/content-team-presets';
import type { AgentMarketplaceSearchProps } from '@props/automation/agent-marketplace.props';
import FilterMenu from '@ui/content/filter-menu/FilterMenu';
import SearchField from '@ui/content/search-field/SearchField';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { ALL_CATEGORY } from './agent-marketplace-filter';

/** The marketplace search, with the team Filters menu inside it. */
export default function AgentMarketplaceSearch({
  category,
  onCategoryChange,
  onSearchQueryChange,
  searchQuery,
}: AgentMarketplaceSearchProps) {
  const translate = useTranslations('common.automation.agentCreation');

  const teamGroups = useMemo(
    () =>
      [
        ...new Set(CONTENT_TEAM_ROLE_PRESETS.map((preset) => preset.teamGroup)),
      ].sort(),
    [],
  );

  return (
    <SearchField
      ariaLabel={translate('search')}
      onChange={(event) => onSearchQueryChange(event.target.value)}
      placeholder={translate('search')}
      value={searchQuery}
    >
      <FilterMenu
        facets={[
          {
            defaultValue: ALL_CATEGORY,
            key: 'category',
            label: translate('category'),
            onChange: onCategoryChange,
            options: teamGroups.map((group) => ({
              label: group,
              value: group,
            })),
            selection: 'single',
            value: category,
          },
        ]}
        isAttached
        onClear={() => onCategoryChange(ALL_CATEGORY)}
      />
    </SearchField>
  );
}
