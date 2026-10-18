// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import AdminOrgBrandUrlFilter from '@ui/content/admin-filters/AdminOrgBrandUrlFilter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock('@ui/content/admin-filters/AdminOrgBrandFilter', () => ({
  default: ({
    brand,
    onBrandChange,
    onOrganizationChange,
    organization,
  }: {
    brand: string;
    onBrandChange: (value: string) => void;
    onOrganizationChange: (value: string) => void;
    organization: string;
  }) => (
    <section>
      <div>Admin org: {organization || 'none'}</div>
      <div>Admin brand: {brand || 'none'}</div>
      <button type="button" onClick={() => onOrganizationChange('org-2')}>
        Pick Org
      </button>
      <button type="button" onClick={() => onBrandChange('brand-2')}>
        Pick Brand
      </button>
      <button type="button" onClick={() => onOrganizationChange('')}>
        Clear Org
      </button>
    </section>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/configuration/elements/cameras',
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () =>
    new URLSearchParams('organization=org-1&brand=brand-1&page=2&q=wide'),
}));

describe('AdminOrgBrandUrlFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the organization and brand from the URL', () => {
    render(<AdminOrgBrandUrlFilter />);

    expect(screen.getByText('Admin org: org-1')).toBeInTheDocument();
    expect(screen.getByText('Admin brand: brand-1')).toBeInTheDocument();
  });

  it('clears the brand and the page when the organization changes', () => {
    render(<AdminOrgBrandUrlFilter />);

    fireEvent.click(screen.getByRole('button', { name: 'Pick Org' }));

    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/configuration/elements/cameras?organization=org-2&q=wide',
      { scroll: false },
    );
  });

  it('keeps the organization and clears the page when the brand changes', () => {
    render(<AdminOrgBrandUrlFilter />);

    fireEvent.click(screen.getByRole('button', { name: 'Pick Brand' }));

    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/configuration/elements/cameras?organization=org-1&brand=brand-2&q=wide',
      { scroll: false },
    );
  });

  it('drops the organization param when it is cleared', () => {
    render(<AdminOrgBrandUrlFilter />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear Org' }));

    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/configuration/elements/cameras?q=wide',
      { scroll: false },
    );
  });
});
