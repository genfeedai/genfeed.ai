import type {
  SwitcherDropdownFooterAction,
  SwitcherDropdownItem,
} from '@genfeedai/props/ui/menus/switcher-dropdown.props';
import { render, screen, waitFor } from '@testing-library/react';
import TopbarOrganizationSwitcher from '@ui/topbars/organization-switcher/TopbarOrganizationSwitcher';
import type { ReactNode } from 'react';
import { HiOutlineCog6Tooth } from 'react-icons/hi2';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();
const mockGetMyOrganizations = vi.fn();
let capturedFooterActions: SwitcherDropdownFooterAction[] = [];
let capturedItems: SwitcherDropdownItem[] = [];

vi.mock('next/navigation', () => ({
  useParams: () => ({
    orgSlug: 'acme-org',
  }),
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    selectedBrand: {
      organization: { slug: 'acme-org' },
      slug: 'acme-brand',
    },
  }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    createOrganization: vi.fn(),
    getMyOrganizations: mockGetMyOrganizations,
    switchOrganization: vi.fn(),
  }),
}));

vi.mock('@genfeedai/services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@ui/menus/switcher-dropdown/SwitcherDropdown', () => ({
  default: ({
    footerActions = [],
    items = [],
    renderTrigger,
  }: {
    footerActions?: SwitcherDropdownFooterAction[];
    items?: SwitcherDropdownItem[];
    renderTrigger: (state: {
      isDisabled: boolean;
      isOpen: boolean;
    }) => ReactNode;
  }) => {
    capturedFooterActions = footerActions;
    capturedItems = items;
    return (
      <div data-testid="switcher-dropdown">
        {renderTrigger({ isDisabled: false, isOpen: false })}
      </div>
    );
  },
}));

describe('TopbarOrganizationSwitcher', () => {
  beforeEach(() => {
    capturedFooterActions = [];
    capturedItems = [];
    mockGetMyOrganizations.mockReset();
    mockPush.mockReset();
    mockGetMyOrganizations.mockResolvedValue([
      {
        brand: { id: 'brand_1', label: 'Acme Brand' },
        id: 'org_1',
        isActive: true,
        label: 'Acme Org',
      },
    ]);
  });

  it('loads organizations and exposes topbar org actions', async () => {
    render(<TopbarOrganizationSwitcher />);

    await waitFor(() => {
      expect(capturedItems).toHaveLength(1);
    });

    expect(capturedItems[0]?.label).toBe('Acme Org');
    expect(capturedFooterActions.map((action) => action.label)).toEqual([
      'Organization Settings',
      'New Organization',
    ]);
    expect(capturedFooterActions[0]?.icon).toBe(HiOutlineCog6Tooth);

    capturedFooterActions[0]?.onAction();

    expect(mockPush).toHaveBeenCalledWith('/acme-org/~/settings');
  });

  it('renders the compact organization trigger', async () => {
    render(<TopbarOrganizationSwitcher />);

    await waitFor(() => {
      expect(capturedItems).toHaveLength(1);
    });

    expect(
      screen.getByTestId('organization-switcher-trigger'),
    ).toHaveTextContent('Acme Org');
    expect(
      screen.getByTestId('organization-switcher-trigger'),
    ).not.toHaveTextContent('Workspace');
  });
});
