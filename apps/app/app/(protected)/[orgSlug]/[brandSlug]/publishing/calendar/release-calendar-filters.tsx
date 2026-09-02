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
import DropdownMultiSelect from '@ui/dropdowns/multiselect/DropdownMultiSelect';
import { Button } from '@ui/primitives/button';

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

  return (
    <fieldset className="flex min-w-0 flex-wrap items-center gap-1.5 border-0">
      <legend className="sr-only">Calendar filters</legend>
      <DropdownMultiSelect
        name="status"
        onChange={handleChange}
        options={STATUS_OPTIONS}
        placeholder="All statuses"
        values={filters.status}
      />
      <DropdownMultiSelect
        name="platform"
        onChange={handleChange}
        options={platformOptions}
        placeholder="All platforms"
        values={filters.platform}
      />
      <DropdownMultiSelect
        name="credentialId"
        onChange={handleChange}
        options={credentialOptions}
        placeholder="All channels"
        values={filters.credentialId}
      />
      <DropdownMultiSelect
        name="executionState"
        onChange={handleChange}
        options={EXECUTION_STATE_OPTIONS}
        placeholder="All target states"
        values={filters.executionState}
      />
      <DropdownMultiSelect
        name="source"
        onChange={handleChange}
        options={SOURCE_OPTIONS}
        placeholder="All sources"
        values={filters.source}
      />
      {hasAnyFilter(filters) ? (
        <Button
          label="Clear filters"
          onClick={() => onChange(EMPTY_RELEASE_CALENDAR_FILTERS)}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
        />
      ) : null}
    </fieldset>
  );
}
