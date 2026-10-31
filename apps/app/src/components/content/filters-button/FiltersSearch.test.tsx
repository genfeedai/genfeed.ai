import '@testing-library/jest-dom/vitest';
import type { IFiltersState } from '@genfeedai/contracts/interfaces/utils/filters.interface';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FiltersSearch from '@/components/content/filters-button/FiltersSearch';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    key === 'searchPlaceholder' ? 'Search label, description, or tags' : key,
}));

const FILTERS: IFiltersState = {
  favorite: '',
  format: '',
  model: '',
  provider: '',
  search: '',
  sort: '',
  status: '',
  type: 'image',
};

const VISIBLE_FILTERS = { type: true };

describe('FiltersSearch', () => {
  it('reports the search with the other filters kept', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(
      <FiltersSearch
        filters={FILTERS}
        onFiltersChange={onFiltersChange}
        visibleFilters={VISIBLE_FILTERS}
      />,
    );

    await user.type(
      screen.getByPlaceholderText('Search label, description, or tags'),
      'cat{Enter}',
    );

    expect(onFiltersChange).toHaveBeenCalledExactlyOnceWith(
      { ...FILTERS, search: 'cat' },
      expect.objectContaining({ search: 'cat', type: 'image' }),
    );
  });

  it('carries the Filters menu inside the field', () => {
    render(
      <FiltersSearch
        filters={FILTERS}
        onFiltersChange={vi.fn()}
        visibleFilters={VISIBLE_FILTERS}
      />,
    );

    const field = screen.getByRole('textbox').parentElement?.parentElement;
    expect(field).not.toBeNull();
    expect(
      within(field as HTMLElement).getByRole('button', { name: /menu/ }),
    ).toBeInTheDocument();
  });

  it('shows no Filters menu when the page has no facet', () => {
    render(
      <FiltersSearch
        filters={FILTERS}
        onFiltersChange={vi.fn()}
        visibleFilters={{}}
      />,
    );
    expect(screen.queryByRole('button', { name: /menu/ })).toBeNull();
  });
});
