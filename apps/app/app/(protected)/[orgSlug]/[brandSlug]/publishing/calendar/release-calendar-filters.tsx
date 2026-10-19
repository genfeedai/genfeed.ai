import {
  type CredentialPlatform,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import { getPlatformIconComponent } from '@helpers/ui/platform-icon/platform-icon.helper';
import type {
  ReleaseCalendarFilters as CalendarFilters,
  ReleaseCalendarFilterOption,
  ReleaseCalendarFiltersProps,
} from '@props/publisher/release-calendar.props';
import FilterMenu from '@ui/content/filter-menu/FilterMenu';
import { useTranslations } from 'next-intl';

/**
 * Enum values are lowercase, hyphenated wire identifiers. The dropdown shows a
 * human label while the selection keeps the wire value, so the query string the
 * API receives never depends on presentation.
 */
function toOption(value: string): ReleaseCalendarFilterOption {
  return { label: value.replaceAll('-', ' '), value };
}

const STATUS_OPTIONS = Object.values(ReleaseStatus).map(toOption);
const EXECUTION_STATE_OPTIONS =
  Object.values(TargetExecutionState).map(toOption);
const SOURCE_OPTIONS = Object.values(ReleaseTargetSource).map(toOption);

export const EMPTY_RELEASE_CALENDAR_FILTERS: CalendarFilters = {
  credentialId: [],
  executionState: [],
  platform: [],
  source: [],
  status: [],
};

export default function ReleaseCalendarFilters({
  credentialOptions,
  filters,
  onChange,
  platformOptions,
}: ReleaseCalendarFiltersProps): React.JSX.Element {
  const translate = useTranslations('pages.publishing.calendar');
  // Each dropdown reports its own facet name, so one handler keeps the mapping
  // between control and filter key in a single place.
  const handleChange = (name: string, values: string[]): void => {
    switch (name) {
      case 'credentialId':
        onChange({ ...filters, credentialId: values });
        return;
      case 'executionState':
        onChange({
          ...filters,
          executionState: values as TargetExecutionState[],
        });
        return;
      case 'platform':
        onChange({ ...filters, platform: values as CredentialPlatform[] });
        return;
      case 'source':
        onChange({ ...filters, source: values as ReleaseTargetSource[] });
        return;
      case 'status':
        onChange({ ...filters, status: values as ReleaseStatus[] });
        return;
      default:
        return;
    }
  };

  const facets: FilterMenuFacet[] = (
    [
      { key: 'status', label: 'Status', options: STATUS_OPTIONS },
      { key: 'platform', label: 'Platform', options: platformOptions },
      { key: 'credentialId', label: 'Channel', options: credentialOptions },
      {
        key: 'executionState',
        label: 'Target state',
        options: EXECUTION_STATE_OPTIONS,
      },
      { key: 'source', label: 'Source', options: SOURCE_OPTIONS },
    ] satisfies {
      key: keyof CalendarFilters;
      label: string;
      options: ReleaseCalendarFilterOption[];
    }[]
  ).map(({ key, label, options }) => ({
    emptyLabel: translate('noFilterOptions'),
    key,
    label,
    onChange: (values: string[]) => handleChange(key, values),
    options: options.map((option) => {
      const PlatformIcon = option.platform
        ? getPlatformIconComponent(option.platform)
        : undefined;
      return {
        ...option,
        icon: PlatformIcon ? (
          <PlatformIcon aria-hidden="true" className="size-4" />
        ) : undefined,
      };
    }),
    selection: multiple,
    values: filters[key],
  }));

  return (
    <FilterMenu
      allLabel="All"
      clearLabel={translate('clearFilters')}
      facets={facets}
      getActiveCountLabel={(count) => translate('activeFilterCount', { count })}
      label={translate('filters')}
      onClear={() => onChange(EMPTY_RELEASE_CALENDAR_FILTERS)}
    />
  );
}
