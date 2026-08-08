import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import ReviewStatusFilters from './ReviewStatusFilters';

describe('ReviewStatusFilters', () => {
  it('renders status tabs with counts and reports filter changes', () => {
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

    expect(
      screen.getByRole('navigation', { name: 'Review status filters' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ready/i })).toHaveAttribute(
      'aria-current',
      'page',
    );

    fireEvent.click(screen.getByRole('button', { name: /Approved/i }));
    expect(onFilterChange).toHaveBeenCalledWith('approved');
  });
});
