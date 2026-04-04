import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SidebarBrandRail from '@ui/menus/sidebar-brand-rail/SidebarBrandRail';
import type { ImgHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const { mockOpenBrandOverlay, mockPatchMeBrand, mockRefresh, mockUserReload } =
  vi.hoisted(() => ({
    mockOpenBrandOverlay: vi.fn(),
    mockPatchMeBrand: vi.fn().mockResolvedValue(undefined),
    mockRefresh: vi.fn(),
    mockUserReload: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: {
      reload: mockUserReload,
    },
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    brands: [
      { id: 'brand-1', label: 'Acme', logoUrl: '' },
      { id: 'brand-2', label: 'Beta', logoUrl: '' },
    ],
    selectedBrand: { id: 'brand-1', label: 'Acme', logoUrl: '' },
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    patchMeBrand: mockPatchMeBrand,
  }),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useBrandOverlay: () => ({
    openBrandOverlay: mockOpenBrandOverlay,
  }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/workspace/overview',
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

vi.mock('next/image', () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => (
    <img alt={props.alt ?? ''} {...props} />
  ),
}));

vi.mock('@ui/primitives/tooltip', () => ({
  SimpleTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('SidebarBrandRail', () => {
  it('renders brands, active highlight, and create affordance', () => {
    render(<SidebarBrandRail />);

    expect(screen.getByTestId('sidebar-brand-brand-1')).toHaveAttribute(
      'data-active',
      'true',
    );
    expect(screen.getByTestId('sidebar-brand-brand-2')).toHaveAttribute(
      'data-active',
      'false',
    );
    expect(screen.getByTestId('sidebar-brand-create')).toBeInTheDocument();
  });

  it('switches brands from the rail', async () => {
    render(<SidebarBrandRail />);

    fireEvent.click(screen.getByTestId('sidebar-brand-brand-2'));

    await waitFor(() => {
      expect(mockPatchMeBrand).toHaveBeenCalledWith('brand-2', {
        isSelected: true,
      });
    });
    expect(mockUserReload).toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('opens the create brand flow from the dedicated affordance', () => {
    render(<SidebarBrandRail />);

    fireEvent.click(screen.getByTestId('sidebar-brand-create'));

    expect(mockOpenBrandOverlay).toHaveBeenCalledWith(null);
  });

  it('clips horizontal overflow inside the rail scroll region', () => {
    render(<SidebarBrandRail />);

    expect(screen.getByTestId('sidebar-brand-rail-scroll')).toHaveClass(
      'overflow-x-hidden',
      'overflow-y-auto',
    );
  });
});
