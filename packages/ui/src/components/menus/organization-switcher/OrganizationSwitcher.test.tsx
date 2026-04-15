import type {
  SwitcherDropdownFooterAction,
  SwitcherDropdownItem,
} from '@genfeedai/props/ui/menus/switcher-dropdown.props';
import { render, waitFor } from '@testing-library/react';
import OrganizationSwitcher from '@ui/menus/organization-switcher/OrganizationSwitcher';
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
  }: {
    footerActions?: SwitcherDropdownFooterAction[];
    items?: SwitcherDropdownItem[];
  }) => {
    capturedFooterActions = footerActions;
    capturedItems = items;
    return <div data-testid="switcher-dropdown" />;
  },
}));

describe('OrganizationSwitcher', () => {
  beforeEach(() => {
    capturedFooterActions = [];
    capturedItems = [];
    mockGetMyOrganizations.mockReset();
    mockPush.mockReset();
    mockGetMyOrganizations.mockResolvedValue([
      {
        brand: null,
        id: 'org_1',
        isActive: true,
        label: 'Acme Org',
      },
    ]);
  });

  it('loads organizations and exposes contextual footer actions', async () => {
    render(<OrganizationSwitcher />);

    await waitFor(() => {
      expect(capturedItems).toHaveLength(1);
    });

    expect(capturedItems[0]?.label).toBe('Acme Org');
    expect(capturedFooterActions.map((action) => action.label)).toEqual([
      'Organization Settings',
      'New Organization',
    ]);

    capturedFooterActions[0]?.onAction();

    expect(mockPush).toHaveBeenCalledWith('/acme-org/~/settings/organization');
  });
});
