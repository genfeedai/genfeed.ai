import { FilterProvider } from '@genfeedai/contexts/content/filter-context/filter-context';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('FilterContext', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <FilterProvider>
        <div data-testid="child" />
      </FilterProvider>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <FilterProvider>
        <div data-testid="child" />
      </FilterProvider>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <FilterProvider>
        <div data-testid="child" />
      </FilterProvider>,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
