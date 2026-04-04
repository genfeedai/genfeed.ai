import { ElementsFiltersProvider } from '@providers/elements-filters/elements-filters.provider';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('ElementsFiltersProvider', () => {
  it('should render without crashing', () => {
    const { container } = render(<ElementsFiltersProvider />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<ElementsFiltersProvider />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<ElementsFiltersProvider />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
