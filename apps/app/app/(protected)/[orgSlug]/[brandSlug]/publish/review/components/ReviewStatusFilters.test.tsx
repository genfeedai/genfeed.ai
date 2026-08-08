import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import ReviewStatusFilters from './ReviewStatusFilters';

const onChangeMock = vi.fn();

vi.mock('@ui/buttons/dropdown/button-dropdown/ButtonDropdown', () => ({
  default: ({
    onChange,
    options,
    value,
  }: {
    onChange: (name: string, value: string) => void;
    options: Array<{ label: string; value: string }>;
    value: string;
  }) => {
    onChangeMock.mockImplementation(onChange);
    return (
      <div>
        <div data-testid="active-status">{value}</div>
        <ul>
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                onClick={() => {
                  onChange('review-status', option.value);
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  },
}));

describe('ReviewStatusFilters', () => {
  beforeEach(() => {
    onChangeMock.mockReset();
  });

  it('renders a status dropdown with counts and reports filter changes', () => {
    const onFilterChange = vi.fn();

    render(
      <ReviewStatusFilters
        activeFilter="ready"
        filterCounts={{
          all: 20,
          approved: 0,
          changes_requested: 0,
          failed: 0,
          pending: 0,
          ready: 20,
          skipped: 0,
        }}
        onFilterChange={onFilterChange}
      />,
    );

    expect(screen.getByTestId('active-status')).toHaveTextContent('ready');
    expect(
      screen.getByRole('button', { name: 'Ready · 20' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Approved · 0' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approved · 0' }));
    expect(onFilterChange).toHaveBeenCalledWith('approved');
  });
});
