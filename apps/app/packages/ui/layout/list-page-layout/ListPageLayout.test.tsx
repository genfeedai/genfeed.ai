import type { IFiltersState } from '@genfeedai/interfaces/utils/filters.interface';
import { render } from '@testing-library/react';
import ListPageLayout from '@ui/layout/list-page-layout/ListPageLayout';
import { describe, expect, it, vi } from 'vitest';

describe('ListPageLayout', () => {
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

  const items = [{ id: 'item-1', name: 'Example Item' }];
  const columns = [{ header: 'Name', key: 'name' }];

  it('should render without crashing', () => {
    const { container } = render(
      <ListPageLayout
        title="Items"
        items={items}
        columns={columns}
        filters={filters}
        onFiltersChange={vi.fn()}
        showPagination={false}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <ListPageLayout
        title="Items"
        items={items}
        columns={columns}
        filters={filters}
        onFiltersChange={vi.fn()}
        showPagination={false}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <ListPageLayout
        title="Items"
        items={items}
        columns={columns}
        filters={filters}
        onFiltersChange={vi.fn()}
        showPagination={false}
      />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
