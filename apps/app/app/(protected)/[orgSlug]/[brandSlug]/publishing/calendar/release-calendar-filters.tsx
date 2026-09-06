'use client';

import {
  ButtonSize,
  ButtonVariant,
  type CredentialPlatform,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  ReleaseCalendarFilters as CalendarFilters,
  ReleaseCalendarFilterOption,
  ReleaseCalendarFiltersProps,
} from '@props/publisher/release-calendar.props';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { ListFilter } from 'lucide-react';
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

function hasAnyFilter(filters: CalendarFilters): boolean {
  return (
    filters.credentialId.length > 0 ||
    filters.executionState.length > 0 ||
    filters.platform.length > 0 ||
    filters.source.length > 0 ||
    filters.status.length > 0
  );
}

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

  const facets: {
    key: keyof CalendarFilters;
    label: string;
    options: ReleaseCalendarFilterOption[];
  }[] = [
    { key: 'status', label: 'Status', options: STATUS_OPTIONS },
    { key: 'platform', label: 'Platform', options: platformOptions },
    { key: 'credentialId', label: 'Channel', options: credentialOptions },
    {
      key: 'executionState',
      label: 'Target state',
      options: EXECUTION_STATE_OPTIONS,
    },
    { key: 'source', label: 'Source', options: SOURCE_OPTIONS },
  ];
  const selectedCount = Object.values(filters).reduce(
    (count, values) => count + values.length,
    0,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          withWrapper={false}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          aria-label="Calendar filters"
        >
          <ListFilter className="size-3.5" />
          {selectedCount > 0
            ? translate('filtersWithCount', { count: selectedCount })
            : translate('filters')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {facets.map(({ key, label, options }) => (
          <DropdownMenuSub key={key}>
            <DropdownMenuSubTrigger className="[&>svg]:ml-0">
              {label}
              <span className="ml-auto text-xs text-muted-foreground">
                {filters[key].length || 'All'}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-80 min-w-52 overflow-y-auto">
              {options.length === 0 ? (
                <DropdownMenuItem disabled>
                  {translate('noFilterOptions')}
                </DropdownMenuItem>
              ) : (
                options.map((option) => {
                  const values: string[] = filters[key];
                  return (
                    <DropdownMenuCheckboxItem
                      key={option.value}
                      checked={values.includes(option.value)}
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={(checked) =>
                        handleChange(
                          key,
                          checked
                            ? [...values, option.value]
                            : values.filter((value) => value !== option.value),
                        )
                      }
                    >
                      {option.label}
                    </DropdownMenuCheckboxItem>
                  );
                })
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
        {hasAnyFilter(filters) ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onChange(EMPTY_RELEASE_CALENDAR_FILTERS)}
            >
              {translate('clearFilters')}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
