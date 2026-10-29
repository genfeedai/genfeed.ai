import { render, screen } from '@testing-library/react';
import SubbarControls from '@ui/layout/subbar-controls/SubbarControls';
import { describe, expect, it } from 'vitest';

describe('SubbarControls', () => {
  it('renders dropdowns, Filters, views, then the primary action', () => {
    render(
      <div data-testid="bar">
        <SubbarControls
          primaryAction={<span>Create</span>}
          views={<span>Views</span>}
          filters={<span>Filters</span>}
          dropdowns={<span>Organization</span>}
        />
      </div>,
    );

    expect(
      Array.from(screen.getByTestId('bar').children).map(
        (child) => child.textContent,
      ),
    ).toEqual(['Organization', 'Filters', 'Views', 'Create']);
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
