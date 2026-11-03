// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminScopeFilter from '@/components/content/admin-filters/AdminScopeFilter';
import FilterMenu from '@/components/content/filter-menu/FilterMenu';

const mocks = vi.hoisted(() => ({
  query: 'organization=org-1&brand=brand-1&page=2&q=wide',
  replace: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      all: 'All',
      clear: 'Clear filters',
      menu: 'Filters',
      noBrands: 'No brands',
      noOrganizations: 'No organizations',
      'facets.brand': 'Brand',
      'facets.organization': 'Organization',
      searchBrands: 'Search brands',
      searchOrganizations: 'Search organizations',
    })[key] ?? key,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/configuration/elements/cameras',
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.query),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    isLoading: false,
    data:
      queryKey[0] === 'admin-organizations'
        ? [
            { id: 'org-1', label: 'Alpha' },
            { id: 'org-2', label: 'Beta' },
          ]
        : [
            { id: 'brand-1', label: 'First brand' },
            { id: 'brand-2', label: 'Second brand' },
          ],
  }),
}));

async function openFacet(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) {
  await user.click(screen.getByRole('button', { name: /^Filters/ }));
  screen.getByRole('menuitem', { name }).focus();
  await user.keyboard('{ArrowRight}');
}

describe('AdminScopedFilterMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query = 'organization=org-1&brand=brand-1&page=2&q=wide';
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('puts the organization and brand after the page facets in one Filters menu', async () => {
    const user = userEvent.setup();
    render(
      <FilterMenu
        facets={[
          {
            key: 'status',
            label: 'Status',
            onChange: vi.fn(),
            options: [{ label: 'Active', value: 'active' }],
            selection: 'multiple',
            values: [],
          },
        ]}
        hasAdminScope
        onClear={vi.fn()}
      />,
    );

    // Organization and brand are both set, so both count as active filters.
    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveTextContent(
      '2',
    );
    await user.click(screen.getByRole('button', { name: /^Filters/ }));

    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining('Status'),
      expect.stringContaining('Organization'),
      expect.stringContaining('Brand'),
      'Clear filters',
    ]);
  });

  it('replaces the URL with the picked organization and drops the brand and page', async () => {
    const user = userEvent.setup();
    render(<AdminScopeFilter />);

    await openFacet(user, /Organization/);
    await user.click(
      await screen.findByRole('menuitemradio', { name: /Beta/ }),
    );

    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(
      '/admin/configuration/elements/cameras?organization=org-2&q=wide',
      { scroll: false },
    );
  });

  it('keeps the organization and drops the page when a brand is picked', async () => {
    const user = userEvent.setup();
    render(<AdminScopeFilter />);

    await openFacet(user, /Brand/);
    await user.click(
      await screen.findByRole('menuitemradio', { name: /Second brand/ }),
    );

    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(
      '/admin/configuration/elements/cameras?organization=org-1&brand=brand-2&q=wide',
      { scroll: false },
    );
  });

  it('offers no brand facet until an organization is picked', async () => {
    const user = userEvent.setup();
    mocks.query = 'q=wide';
    render(<AdminScopeFilter />);

    await user.click(screen.getByRole('button', { name: /^Filters/ }));

    expect(
      screen.getByRole('menuitem', { name: /Organization/ }),
    ).toBeVisible();
    expect(
      screen.queryByRole('menuitem', { name: /Brand/ }),
    ).not.toBeInTheDocument();
  });

  it('clears the page filters first, then the organization and brand', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<FilterMenu facets={[]} hasAdminScope onClear={onClear} />);

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Clear filters' }));

    expect(onClear).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(
        '/admin/configuration/elements/cameras?q=wide',
        { scroll: false },
      ),
    );
  });
});
