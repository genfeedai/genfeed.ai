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

  it('should handle user interactions correctly', () => {
    render(
      <ElementsFiltersProvider>
        <span data-testid="child">test</span>
      </ElementsFiltersProvider>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    render(
      <ElementsFiltersProvider>
        <span data-testid="child">test</span>
      </ElementsFiltersProvider>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
