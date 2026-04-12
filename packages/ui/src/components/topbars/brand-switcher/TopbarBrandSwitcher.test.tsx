import type { SwitcherDropdownFooterAction } from '@genfeedai/props/ui/menus/switcher-dropdown.props';
import { render, screen } from '@testing-library/react';
import TopbarBrandSwitcher from '@ui/topbars/brand-switcher/TopbarBrandSwitcher';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();
const openBrandOverlaySpy = vi.fn();
let capturedFooterActions: SwitcherDropdownFooterAction[] = [];

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: { reload: vi.fn() },
  }),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    brands: [
      { id: 'brand-1', isDarkroomEnabled: false, label: 'Acme Brand' },
      { id: 'brand-2', isDarkroomEnabled: true, label: 'Side Brand' },
    ],
  }),
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    useBrandOverlay: () => ({
      openBrandOverlay: openBrandOverlaySpy,
    }),
  }),
);

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    patchMeBrand: vi.fn(),
  }),
}));

vi.mock('@genfeedai/services/organization/users.service', () => ({
  UsersService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/library/ingredients',
  useRouter: () => ({
    push: mockPush,
    refresh: vi.fn(),
  }),
}));

vi.mock('@ui/menus/switcher-dropdown/SwitcherDropdown', () => ({
  default: ({
    footerActions = [],
    renderTrigger,
  }: {
    footerActions?: SwitcherDropdownFooterAction[];
    renderTrigger: (state: {
      isDisabled: boolean;
      isOpen: boolean;
    }) => ReactNode;
  }) => {
    capturedFooterActions = footerActions;

    return (
      <div data-testid="switcher-dropdown">
        {renderTrigger({ isDisabled: false, isOpen: false })}
      </div>
    );
  },
}));

describe('TopbarBrandSwitcher', () => {
  beforeEach(() => {
    capturedFooterActions = [];
    mockPush.mockReset();
    openBrandOverlaySpy.mockReset();
  });

  it('renders the brand trigger with subordinate label hierarchy', () => {
    render(<TopbarBrandSwitcher />);

    expect(screen.getByTestId('brand-switcher-trigger')).toHaveTextContent(
      'Brand',
    );
    expect(screen.getByTestId('brand-switcher-trigger')).toHaveTextContent(
      'Acme Brand',
    );
  });

  it('exposes brand settings and creation actions', () => {
    render(<TopbarBrandSwitcher />);

    expect(capturedFooterActions.map((action) => action.label)).toEqual([
      'Settings',
      'New Brand',
    ]);

    capturedFooterActions[0]?.onAction();
    expect(mockPush).toHaveBeenCalledWith('/settings/brands/brand-1');

    capturedFooterActions[1]?.onAction();
    expect(openBrandOverlaySpy).toHaveBeenCalledWith(null);
  });
});
