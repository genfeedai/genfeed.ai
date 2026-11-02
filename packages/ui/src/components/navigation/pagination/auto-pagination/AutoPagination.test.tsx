import { fireEvent, render, screen } from '@testing-library/react';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams('page=2&q=launch&folder=assets'),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/library',
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));
describe('AutoPagination', () => {
  beforeEach(() => {
    mocks.replace.mockClear();
  });
  it('uses the URL page and the response page count', () => {
    render(<AutoPagination totals={{ totalDocs: 50, totalPages: 5 }} />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: '5' })).toBeInTheDocument();
  });
  it('keeps totals visible when there is only one page', () => {
    render(<AutoPagination totals={{ totalDocs: 4, totalPages: 1 }} />);
    expect(screen.getByText('4 results')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
  it('can hide the total without hiding page navigation', () => {
    render(
      <AutoPagination
        showTotal={false}
        totals={{ totalDocs: 50, totalPages: 5 }}
      />,
    );
    expect(screen.queryByText('50 results')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
  it('keeps two list footers independent through a cached response update', () => {
    const { rerender } = render(
      <>
        <AutoPagination
          totalLabel="roles"
          totals={{ totalDocs: 61, totalPages: 3 }}
        />
        <AutoPagination
          totalLabel="accounts"
          totals={{ totalDocs: 4, totalPages: 1 }}
        />
      </>,
    );
    expect(screen.getByText('61 roles')).toBeInTheDocument();
    expect(screen.getByText('4 accounts')).toBeInTheDocument();
    rerender(
      <>
        <AutoPagination
          totalLabel="roles"
          totals={{ totalDocs: 12, totalPages: 2 }}
        />
        <AutoPagination
          totalLabel="accounts"
          totals={{ totalDocs: 4, totalPages: 1 }}
        />
      </>,
    );
    expect(screen.getByText('12 roles')).toBeInTheDocument();
    expect(screen.getByText('4 accounts')).toBeInTheDocument();
    expect(screen.queryByText('61 roles')).not.toBeInTheDocument();
  });
  it('preserves filters when changing pages and omits page one from the URL', () => {
    render(<AutoPagination totals={{ totalDocs: 50, totalPages: 5 }} />);
    fireEvent.click(screen.getByRole('link', { name: '3' }));
    expect(mocks.replace).toHaveBeenLastCalledWith(
      '/library?page=3&q=launch&folder=assets',
      { scroll: false },
    );
    fireEvent.click(screen.getByRole('link', { name: '1' }));
    expect(mocks.replace).toHaveBeenLastCalledWith(
      '/library?q=launch&folder=assets',
      { scroll: false },
    );
  });
});
