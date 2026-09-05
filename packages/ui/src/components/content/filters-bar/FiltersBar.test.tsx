import { IngredientStatus } from '@genfeedai/contracts';
import type { IFiltersState } from '@genfeedai/contracts/interfaces/utils/filters.interface';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('sizes the Clear icon to match toolbar chrome (not text-lg)', () => {
    const onFiltersChange = vi.fn();

    render(
      <FiltersBar
        filters={{
          ...filters,
          status: [IngredientStatus.PROCESSING],
          sort: 'createdAt: -1',
        }}
        onFiltersChange={onFiltersChange}
        visibleFilters={{
          favorite: false,
          format: true,
          model: false,
          provider: false,
          search: false,
          sort: true,
          status: true,
          type: false,
        }}
      />,
    );

    const clear = screen.getByRole('button', { name: 'Clear filters' });
    expect(clear).toBeInTheDocument();
    expect(clear).toHaveClass('text-xs');

    const icon = clear.querySelector('svg');
    expect(icon).toBeTruthy();
    expect(icon).toHaveClass('size-3.5');
    expect(icon).not.toHaveClass('text-lg');

    fireEvent.click(clear);
    expect(onFiltersChange).toHaveBeenCalled();
  });
  it('keeps typed search text until debounce and clears the same named filter', async () => {
    const onFiltersChange = vi.fn();
    render(
      <FiltersBar
        filters={filters}
        onFiltersChange={onFiltersChange}
        visibleFilters={{ search: true }}
      />,
    );
    const search = screen.getByRole('textbox', { name: 'Search' });
    fireEvent.change(search, { target: { value: 'launch' } });
    await waitFor(() =>
      expect(onFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'launch' }),
        expect.objectContaining({ search: 'launch' }),
      ),
    );
    expect(search).toHaveValue('launch');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
  });
});
