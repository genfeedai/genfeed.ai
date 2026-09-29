import { ElementsFiltersProvider } from '@providers/elements-filters/elements-filters.provider';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('ElementsFiltersProvider', () => {
  it('should render without crashing', () => {
    render(
      <ElementsFiltersProvider>
        <span data-testid="child">test</span>
      </ElementsFiltersProvider>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
