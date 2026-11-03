import { render, screen } from '@testing-library/react';
import SubbarControls from '@ui/layout/subbar-controls/SubbarControls';
import { describe, expect, it } from 'vitest';

describe('SubbarControls', () => {
  it('renders secondary actions, Filters, views, the date range, then the primary action', () => {
    render(
      <div data-testid="bar">
        <SubbarControls
          primaryAction={<span>Create</span>}
          dateRange={<span>Last 7 days</span>}
          views={<span>Views</span>}
          filters={<span>Filters</span>}
          secondaryActions={<span>Sync</span>}
        />
      </div>,
    );

    expect(
      Array.from(screen.getByTestId('bar').children).map(
        (child) => child.textContent,
      ),
    ).toEqual(['Sync', 'Filters', 'Views', 'Last 7 days', 'Create']);
  });

  it('renders nothing for empty slots', () => {
    render(
      <div data-testid="bar">
        <SubbarControls />
      </div>,
    );

    expect(screen.getByTestId('bar')).toBeEmptyDOMElement();
  });
});
