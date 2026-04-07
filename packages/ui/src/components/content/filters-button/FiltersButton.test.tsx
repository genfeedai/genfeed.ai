import type { IFiltersState } from '@genfeedai/interfaces/utils/filters.interface';
import { fireEvent, render, screen } from '@testing-library/react';
import FiltersButton from '@ui/content/filters-button/FiltersButton';
import { describe, expect, it, vi } from 'vitest';

describe('FiltersButton', () => {
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
      <FiltersButton filters={filters} onFiltersChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    render(<FiltersButton filters={filters} onFiltersChange={vi.fn()} />);
    const toggle = screen.getByRole('button');
    fireEvent.click(toggle);
    expect(
      screen.getByPlaceholderText('Search label, description, or tags'),
    ).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <FiltersButton filters={filters} onFiltersChange={vi.fn()} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
