import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import ReviewStatusFilters from './ReviewStatusFilters';

vi.mock('@ui/dropdowns/multiselect/DropdownMultiSelect', () => ({
  default: ({
    onChange,
    options,
    values,
  }: {
    onChange: (name: string, values: string[]) => void;
    options: Array<{ label: string; value: string }>;
    values: string[];
  }) => (
    <div>
      <div data-testid="active-statuses">{values.join(',')}</div>
      <ul>
        {options.map((option) => (
          <li key={option.value}>
            <button
              type="button"
              onClick={() => {
                const next = values.includes(option.value)
                  ? values.filter((value) => value !== option.value)
                  : [...values, option.value];
                onChange('review-status', next);
              }}
            >
              {option.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  ),
}));

describe('ReviewStatusFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders multi-select options with counts and toggles statuses', () => {
    const onFilterChange = vi.fn();

    render(
      <ReviewStatusFilters
        activeFilters={['ready']}
        filterCounts={{
          all: 20,
          approved: 2,
          changes_requested: 0,
          failed: 0,
          pending: 0,
          ready: 18,
          skipped: 0,
        }}
        onFilterChange={onFilterChange}
      />,
    );

    expect(screen.getByTestId('active-statuses')).toHaveTextContent('ready');
    expect(
      screen.getByRole('button', { name: 'Ready · 18' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Approved · 2' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approved · 2' }));
    expect(onFilterChange).toHaveBeenCalledWith(['ready', 'approved']);
  });
});
