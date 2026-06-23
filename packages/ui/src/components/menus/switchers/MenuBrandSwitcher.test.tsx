import type {
  SwitcherDropdownFooterAction,
  SwitcherDropdownItem,
} from '@genfeedai/props/ui/menus/switcher-dropdown.props';
import { render, screen } from '@testing-library/react';
import MenuBrandSwitcher from '@ui/menus/switchers/MenuBrandSwitcher';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();
let capturedFooterActions: SwitcherDropdownFooterAction[] = [];
let capturedItems: SwitcherDropdownItem[] = [];
let capturedMinWidth: number | undefined;

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

vi.mock('@genfeedai/auth-client/react', () => ({
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
    items = [],
    minWidth,
    renderTrigger,
  }: {
    footerActions?: SwitcherDropdownFooterAction[];
    items?: SwitcherDropdownItem[];
    minWidth?: number;
    renderTrigger: (state: {
      isDisabled: boolean;
      isOpen: boolean;
    }) => React.ReactNode;
  }) => {
    capturedFooterActions = footerActions;
    capturedItems = items;
    capturedMinWidth = minWidth;
    return (
      <div data-testid="switcher-dropdown">
        {renderTrigger({ isDisabled: false, isOpen: false })}
      </div>
    );
  },
}));

describe('MenuBrandSwitcher', () => {
  const brandsWithSlug = [
    {
      id: 'brand_1',
      label: 'Test Brand',
      organization: { slug: 'test-org' },
      slug: 'test-brand',
      thumbnailUrl: '',
    },
  ];

  beforeEach(() => {
    capturedFooterActions = [];
    capturedItems = [];
    capturedMinWidth = undefined;
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

  it('renders a labeled trigger for topbar placement', () => {
    render(
      <MenuBrandSwitcher
        variant="labeled"
        brands={brandsWithSlug}
        brandId="brand_1"
        onBrandChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Switch brand' }),
    ).toHaveTextContent('Test Brand');
    expect(capturedMinWidth).toBe(260);
  });

  it('exposes the brand-switcher-trigger testid showing the brand label (E2E contract)', () => {
    // The release/shell E2E specs bind to this testid + the seeded brand label
    // to prove the shell fetched live org/brand data. Guard the contract here so
    // a refactor that drops it fails fast in unit tests, not only nightly E2E.
    render(
      <MenuBrandSwitcher
        variant="labeled"
        brands={brandsWithSlug}
        brandId="brand_1"
        onBrandChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('brand-switcher-trigger')).toHaveTextContent(
      'Test Brand',
    );
  });

  it('should expose brand settings row action and creation footer action', () => {
    render(
      <MenuBrandSwitcher
        brands={brandsWithSlug}
        brandId="brand_1"
        onBrandChange={vi.fn()}
      />,
    );

    expect(capturedFooterActions.map((action) => action.label)).toEqual([
      'New Brand',
    ]);
    expect(capturedItems[0]?.trailingAction?.ariaLabel).toBe(
      'Open Test Brand settings',
    );

    capturedItems[0]?.trailingAction?.onAction();

    expect(mockPush).toHaveBeenCalledWith('/test-org/test-brand/settings');
  });
});
