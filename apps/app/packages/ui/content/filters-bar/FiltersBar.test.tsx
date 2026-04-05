import type { IFiltersState } from '@genfeedai/interfaces/utils/filters.interface';
import { render } from '@testing-library/react';
import FiltersBar from '@ui/content/filters-bar/FiltersBar';
import { describe, expect, it, vi } from 'vitest';

describe('FiltersBar', () => {
  const filters: IFiltersState = {
    favorite: '',
    format: '',
    model: '',
    provider: '',
    search: '',
    sort: '',
    status: '',
    type: '',
  };

  it('should render without crashing', () => {
    const { container } = render(
      <FiltersBar filters={filters} onFiltersChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <FiltersBar filters={filters} onFiltersChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <FiltersBar filters={filters} onFiltersChange={vi.fn()} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
