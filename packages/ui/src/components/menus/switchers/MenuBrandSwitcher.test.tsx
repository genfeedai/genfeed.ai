import type { SwitcherDropdownFooterAction } from '@genfeedai/props/ui/menus/switcher-dropdown.props';
import { render } from '@testing-library/react';
import MenuBrandSwitcher from '@ui/menus/switchers/MenuBrandSwitcher';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();
let capturedFooterActions: SwitcherDropdownFooterAction[] = [];

vi.mock('next/navigation', () => ({
  useParams: () => ({
    brandSlug: 'test-brand',
    orgSlug: 'test-org',
  }),
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    selectedBrand: {
      organization: { slug: 'test-org' },
      slug: 'test-brand',
    },
  }),
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: {
      id: 'user_123',
    },
  }),
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    useBrandOverlay: () => ({
      openBrandOverlay: vi.fn(),
    }),
  }),
);

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));

vi.mock('@genfeedai/services/organization/users.service', () => ({
  UsersService: {
    getInstance: () => ({}),
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@ui/menus/switcher-dropdown/SwitcherDropdown', () => ({
  default: ({
    footerActions = [],
  }: {
    footerActions?: SwitcherDropdownFooterAction[];
  }) => {
    capturedFooterActions = footerActions;
    return <div data-testid="switcher-dropdown" />;
  },
}));

describe('MenuBrandSwitcher', () => {
  const brandsWithSlug = [
    {
      id: 'brand_1',
      label: 'Test Brand',
      slug: 'test-brand',
      thumbnailUrl: '',
    },
  ];

  beforeEach(() => {
    capturedFooterActions = [];
    mockPush.mockReset();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <MenuBrandSwitcher
        brands={brandsWithSlug}
        brandId="brand_1"
        onBrandChange={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should return null when no brands', () => {
    const { container } = render(
      <MenuBrandSwitcher brands={[]} brandId="" onBrandChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('should expose brand settings and creation actions', () => {
    render(
      <MenuBrandSwitcher
        brands={brandsWithSlug}
        brandId="brand_1"
        onBrandChange={vi.fn()}
      />,
    );

    expect(capturedFooterActions.map((action) => action.label)).toEqual([
      'Settings',
      'New Brand',
    ]);

    capturedFooterActions[0]?.onAction();

    expect(mockPush).toHaveBeenCalledWith('/test-org/test-brand/settings');
  });
});
