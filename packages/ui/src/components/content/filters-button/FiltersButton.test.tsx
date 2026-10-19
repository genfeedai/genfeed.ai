import '@testing-library/jest-dom/vitest';
import type { IFiltersState } from '@genfeedai/contracts/interfaces/utils/filters.interface';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FiltersButton from '@ui/content/filters-button/FiltersButton';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    ({
      activeCount: `${values?.count} active filters`,
      all: 'All',
      clear: 'Clear filters',
      'facets.sort': 'Sort',
      'facets.status': 'Status',
      'facets.type': 'Type',
      menu: 'Filters',
      searchPlaceholder: 'Search label, description, or tags',
    })[key] ?? key,
}));

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

  it('shows the search box beside one Filters trigger', () => {
    render(<FiltersButton filters={filters} onFiltersChange={vi.fn()} />);
    expect(
      screen.getByPlaceholderText('Search label, description, or tags'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Filters/ })).toBeVisible();
  });

  it('reports a single-select facet choice with the rest of the filters', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(
      <FiltersButton
        filters={{ ...filters, search: 'cat' }}
        onFiltersChange={onFiltersChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    screen.getByRole('menuitem', { name: /Type/ }).focus();
    await user.keyboard('{ArrowRight}');
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'Video' }),
    );
    expect(onFiltersChange).toHaveBeenCalledWith(
      { ...filters, search: 'cat', type: 'video' },
      expect.objectContaining({ search: 'cat', type: 'video' }),
    );
  });

  it('collects several statuses and clears facets but keeps the search', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(
      <FiltersButton
        filters={{
          ...filters,
          search: 'cat',
          status: ['draft'],
          type: 'image',
        }}
        onFiltersChange={onFiltersChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Clear filters' }));
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'cat',
        status: [],
        type: '',
      }),
      expect.anything(),
    );
  });

  it('hides facets that are switched off', async () => {
    const user = userEvent.setup();
    render(
      <FiltersButton
        filters={filters}
        onFiltersChange={vi.fn()}
        visibleFilters={{ search: false, sort: true }}
      />,
    );
    expect(
      screen.queryByPlaceholderText('Search label, description, or tags'),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(screen.getByRole('menuitem', { name: /Sort/ })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: /Type/ })).toBeNull();
  });
});
