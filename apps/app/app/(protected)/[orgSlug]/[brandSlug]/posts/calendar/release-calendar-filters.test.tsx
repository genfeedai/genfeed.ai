import {
  CredentialPlatform,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
} from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { ReleaseCalendarFilters as CalendarFilters } from '@props/publisher/release-calendar.props';
import ReleaseCalendarFilters, {
  EMPTY_RELEASE_CALENDAR_FILTERS,
} from './release-calendar-filters';

interface MultiSelectMockProps {
  name: string;
  onChange: (name: string, values: string[]) => void;
  options: Array<{ label: string; value: string }>;
  placeholder?: string;
  values: string[];
}

// Each facet renders one button per option, so a test can select a real option
// by name and assert which filter key the component wrote it to.
vi.mock('@ui/dropdowns/multiselect/DropdownMultiSelect', () => ({
  default: ({ name, onChange, options, placeholder }: MultiSelectMockProps) => (
    <div data-testid={`facet-${name}`}>
      <span>{placeholder}</span>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(name, [option.value])}
        >
          {`${name}:${option.label}`}
        </button>
      ))}
    </div>
  ),
}));

const CREDENTIAL_OPTIONS = [
  { label: '@acme on Instagram', value: 'credential-1' },
];
const PLATFORM_OPTIONS = [
  { label: 'Instagram', value: CredentialPlatform.INSTAGRAM },
];

function renderFilters(
  filters: CalendarFilters = EMPTY_RELEASE_CALENDAR_FILTERS,
) {
  const onChange = vi.fn();
  render(
    <ReleaseCalendarFilters
      credentialOptions={CREDENTIAL_OPTIONS}
      filters={filters}
      onChange={onChange}
      platformOptions={PLATFORM_OPTIONS}
    />,
  );

  return { onChange };
}

describe('ReleaseCalendarFilters', () => {
  it('offers only the brand’s connected channels and platforms', () => {
    renderFilters();

    expect(
      screen.getByRole('button', {
        name: 'credentialId:@acme on Instagram',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'platform:Instagram' }),
    ).toBeInTheDocument();
    // The whole CredentialPlatform enum would list providers the operator has
    // never connected, so exactly one platform option is expected here.
    expect(
      screen.getByTestId('facet-platform').querySelectorAll('button'),
    ).toHaveLength(1);
  });

  it.each([
    ['status', ReleaseStatus.SCHEDULED, 'status'],
    ['executionState', TargetExecutionState.FAILED, 'executionState'],
    ['source', ReleaseTargetSource.WORKFLOW, 'source'],
  ] as const)(
    'writes a %s selection to its own filter key',
    (facet, value, key) => {
      const { onChange } = renderFilters();

      fireEvent.click(
        screen.getByRole('button', {
          name: `${facet}:${value.replaceAll('-', ' ')}`,
        }),
      );

      expect(onChange).toHaveBeenCalledWith({
        ...EMPTY_RELEASE_CALENDAR_FILTERS,
        [key]: [value],
      });
    },
  );

  it('keeps the other facets intact when one facet changes', () => {
    const { onChange } = renderFilters({
      ...EMPTY_RELEASE_CALENDAR_FILTERS,
      status: [ReleaseStatus.SCHEDULED],
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'credentialId:@acme on Instagram' }),
    );

    expect(onChange).toHaveBeenCalledWith({
      credentialId: ['credential-1'],
      executionState: [],
      platform: [],
      source: [],
      status: [ReleaseStatus.SCHEDULED],
    });
  });

  it('hides the clear control until something is actually filtered', () => {
    renderFilters();

    expect(
      screen.queryByRole('button', { name: 'Clear filters' }),
    ).not.toBeInTheDocument();
  });

  it('resets every facet at once from the clear control', () => {
    const { onChange } = renderFilters({
      ...EMPTY_RELEASE_CALENDAR_FILTERS,
      credentialId: ['credential-1'],
      source: [ReleaseTargetSource.AGENT],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(onChange).toHaveBeenCalledWith(EMPTY_RELEASE_CALENDAR_FILTERS);
  });

  it('names the control group for assistive technology', () => {
    renderFilters();

    expect(
      screen.getByRole('group', { name: 'Calendar filters' }),
    ).toBeInTheDocument();
  });
});
