import { resetLastBrandSave } from '@genfeedai/contexts/providers/protected-bootstrap/last-brand-save';
import {
  createBrand,
  createOrganization,
} from '@genfeedai/helpers/testing/entity-fixtures';
import { Brand } from '@genfeedai/models/organization/brand.model';
import type {
  SwitcherDropdownFooterAction,
  SwitcherDropdownItem,
} from '@genfeedai/props/ui/menus/switcher-dropdown.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MenuBrandSwitcher from '@/components/menus/switchers/MenuBrandSwitcher';

const mockPush = vi.fn();
const mockPatchMeBrand = vi.hoisted(() => vi.fn());
const mockReloadUser = vi.hoisted(() => vi.fn());
const mockOpenBrandCreateModal = vi.hoisted(() => vi.fn());
let capturedFooterActions: SwitcherDropdownFooterAction[] = [];
let capturedItems: SwitcherDropdownItem[] = [];
let capturedMinWidth: number | undefined;
let capturedOnSelect: ((id: string) => void) | undefined;

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
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

vi.mock('@genfeedai/hooks/auth/use-auth-user/use-auth-user', () => ({
  useAuthUser: () => ({
    user: {
      id: 'user_123',
      reload: mockReloadUser,
    },
  }),
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({
    useBrandCreateModal: () => ({
      openBrandCreateModal: mockOpenBrandCreateModal,
    }),
  }),
);

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () =>
    vi.fn(async () => ({
      patchMeBrand: mockPatchMeBrand,
    })),
}));

vi.mock('@genfeedai/services/organization/users.service', () => ({
  UsersService: {
    getInstance: () => ({
      patchMeBrand: mockPatchMeBrand,
    }),
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
    onSelect,
    renderTrigger,
  }: {
    footerActions?: SwitcherDropdownFooterAction[];
    items?: SwitcherDropdownItem[];
    minWidth?: number;
    onSelect: (id: string) => void;
    renderTrigger: (state: {
      isDisabled: boolean;
      isOpen: boolean;
    }) => React.ReactNode;
  }) => {
    capturedFooterActions = footerActions;
    capturedItems = items;
    capturedMinWidth = minWidth;
    capturedOnSelect = onSelect;
    return (
      <div data-testid="switcher-dropdown">
        {renderTrigger({ isDisabled: false, isOpen: false })}
      </div>
    );
  },
}));

describe('MenuBrandSwitcher', () => {
  const brandsWithSlug = [
    new Brand(
      createBrand({
        id: 'brand_1',
        label: 'Test Brand',
        organization: Object.assign(createOrganization(), { slug: 'test-org' }),
        slug: 'test-brand',
      }),
    ),
  ];

  beforeEach(() => {
    capturedFooterActions = [];
    capturedItems = [];
    capturedMinWidth = undefined;
    capturedOnSelect = undefined;
    resetLastBrandSave();
    mockPatchMeBrand.mockReset();
    mockPatchMeBrand.mockResolvedValue({});
    mockReloadUser.mockReset();
    mockReloadUser.mockResolvedValue(undefined);
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
    expect(capturedMinWidth).toBe(224);
  });

  it('uses the shared compact square avatar rhythm in labeled mode', () => {
    render(
      <MenuBrandSwitcher
        variant="labeled"
        brands={brandsWithSlug}
        brandId="brand_1"
        onBrandChange={vi.fn()}
      />,
    );

    const trigger = screen.getByTestId('brand-switcher-trigger');
    const avatar = trigger.querySelector('[data-shape]');

    expect(trigger).toHaveClass('h-8', 'gap-2', 'px-2.5', 'rounded-md');
    expect(avatar).toHaveAttribute('data-shape', 'square');
    expect(avatar).toHaveAttribute('data-size', 'xs');
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

    capturedFooterActions[0]?.onAction?.();
    expect(mockOpenBrandCreateModal).toHaveBeenCalledTimes(1);
    expect(capturedItems[0]?.trailingAction?.ariaLabel).toBe(
      'Open Test Brand settings',
    );

    expect(capturedItems[0]?.trailingAction?.href).toBe(
      '/test-org/test-brand/settings',
    );
    expect(capturedItems[0]?.trailingAction?.target).toBeUndefined();
    expect(capturedItems[0]?.extraTrailingActions?.[0]).toMatchObject({
      ariaLabel: 'Open Test Brand public profile',
      href: `${EnvironmentService.apps.website}/@test-brand`,
      target: '_blank',
    });
  });

  it('renders a clear-selection control without adding a synthetic scope row', () => {
    const onClearSelection = vi.fn();

    render(
      <MenuBrandSwitcher
        variant="labeled"
        brands={brandsWithSlug}
        brandId="brand_1"
        onBrandChange={vi.fn()}
        clearSelectionAction={{
          ariaLabel: 'Clear brand selection',
          onSelect: onClearSelection,
        }}
      />,
    );

    expect(screen.getByTestId('brand-switcher-trigger')).toHaveTextContent(
      'Test Brand',
    );
    expect(capturedItems).toHaveLength(1);
    expect(capturedItems[0]).toMatchObject({
      id: 'brand_1',
      isActive: true,
      label: 'Test Brand',
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear brand selection' }),
    );

    expect(onClearSelection).toHaveBeenCalledTimes(1);
    expect(mockPatchMeBrand).not.toHaveBeenCalled();
  });
  describe('choosing another brand', () => {
    const brandsAB = [
      brandsWithSlug[0] as Brand,
      new Brand(
        createBrand({
          id: 'brand_2',
          label: 'Second Brand',
          organization: Object.assign(createOrganization(), {
            slug: 'test-org',
          }),
          slug: 'second-brand',
        }),
      ),
    ];

    it('shows the chosen brand and switches before the save request completes', () => {
      mockPatchMeBrand.mockReturnValue(new Promise(() => undefined));
      const onBrandChange = vi.fn();

      render(
        <MenuBrandSwitcher
          variant="labeled"
          brands={brandsAB}
          brandId="brand_1"
          onBrandChange={onBrandChange}
        />,
      );

      act(() => capturedOnSelect?.('brand_2'));

      expect(onBrandChange).toHaveBeenCalledWith('brand_2');
      expect(screen.getByTestId('brand-switcher-trigger')).toHaveTextContent(
        'Second Brand',
      );
      expect(capturedItems.find((item) => item.isActive)?.id).toBe('brand_2');
    });

    it('follows the real brand again once the route changes it', () => {
      mockPatchMeBrand.mockReturnValue(new Promise(() => undefined));

      const { rerender } = render(
        <MenuBrandSwitcher
          variant="labeled"
          brands={brandsAB}
          brandId="brand_1"
          onBrandChange={vi.fn()}
        />,
      );
      act(() => capturedOnSelect?.('brand_2'));
      rerender(
        <MenuBrandSwitcher
          variant="labeled"
          brands={brandsAB}
          brandId="brand_2"
          onBrandChange={vi.fn()}
        />,
      );
      rerender(
        <MenuBrandSwitcher
          variant="labeled"
          brands={brandsAB}
          brandId="brand_1"
          onBrandChange={vi.fn()}
        />,
      );

      expect(screen.getByTestId('brand-switcher-trigger')).toHaveTextContent(
        'Test Brand',
      );
    });

    it('keeps the switch when saving the last brand fails', async () => {
      mockPatchMeBrand.mockRejectedValue(new Error('offline'));
      const onBrandChange = vi.fn();

      render(
        <MenuBrandSwitcher
          variant="labeled"
          brands={brandsAB}
          brandId="brand_1"
          onBrandChange={onBrandChange}
        />,
      );

      await act(async () => capturedOnSelect?.('brand_2'));

      expect(onBrandChange).toHaveBeenCalledWith('brand_2');
      expect(screen.getByTestId('brand-switcher-trigger')).toHaveTextContent(
        'Second Brand',
      );
    });

    it('sends the save request once when the same brand is chosen twice', async () => {
      render(
        <MenuBrandSwitcher
          variant="labeled"
          brands={brandsAB}
          brandId="brand_1"
          onBrandChange={vi.fn()}
        />,
      );

      await act(async () => {
        capturedOnSelect?.('brand_2');
        capturedOnSelect?.('brand_2');
      });

      expect(mockPatchMeBrand).toHaveBeenCalledTimes(1);
      expect(mockPatchMeBrand).toHaveBeenCalledWith('brand_2');
    });
  });
});
