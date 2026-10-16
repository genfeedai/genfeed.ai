// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
        : [{ id: 'brand-1', label: 'First brand' }],
  }),
}));

describe('AdminOrgBrandFilter', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('uses the searchable shared switcher and only emits the organization change', () => {
    const onOrganizationChange = vi.fn();
    const onBrandChange = vi.fn();
    render(
      <AdminOrgBrandFilter
        organization="org-1"
        brand="brand-1"
        onOrganizationChange={onOrganizationChange}
        onBrandChange={onBrandChange}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Filter by organizations: Alpha' }),
    );
    fireEvent.change(screen.getByPlaceholderText('Search organizations…'), {
      target: { value: 'Beta' },
    });
    expect(
      screen.queryByRole('option', { name: 'Alpha' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /Beta/ }));
    expect(onOrganizationChange).toHaveBeenCalledExactlyOnceWith('org-2');
    // The owner clears brand atomically with organization; a second callback
    // would replace the URL using the previous organization.
    expect(onBrandChange).not.toHaveBeenCalled();
  });

  it('can clear organization scope and hides the dependent brand picker without an organization', () => {
    const onOrganizationChange = vi.fn();
    const props = {
      organization: 'org-1',
      brand: 'brand-1',
      onOrganizationChange,
      onBrandChange: vi.fn(),
    };
    const { rerender } = render(<AdminOrgBrandFilter {...props} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Filter by organizations: Alpha' }),
    );
    fireEvent.click(screen.getByRole('option', { name: /All organizations/ }));
    expect(onOrganizationChange).toHaveBeenCalledExactlyOnceWith('');
    rerender(<AdminOrgBrandFilter {...props} organization="" brand="" />);
    expect(
      screen.queryByRole('button', { name: /Filter by brands/ }),
    ).not.toBeInTheDocument();
  });
});
