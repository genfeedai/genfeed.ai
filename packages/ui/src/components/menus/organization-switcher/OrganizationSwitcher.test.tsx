import type {
  SwitcherDropdownFooterAction,
  SwitcherDropdownItem,
} from '@genfeedai/props/ui/menus/switcher-dropdown.props';
import { render, waitFor } from '@testing-library/react';
import OrganizationSwitcher from '@ui/menus/organization-switcher/OrganizationSwitcher';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();
const mockGetMyOrganizations = vi.fn();
const mockSwitchOrganization = vi.fn();
let mockParams: { orgSlug?: string } = { orgSlug: 'acme-org' };
let capturedFooterActions: SwitcherDropdownFooterAction[] = [];
let capturedItems: SwitcherDropdownItem[] = [];
let capturedOnSelect: ((id: string) => void) | undefined;

vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    createOrganization: vi.fn(),
    getMyOrganizations: mockGetMyOrganizations,
    switchOrganization: mockSwitchOrganization,
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
    onSelect,
  }: {
    footerActions?: SwitcherDropdownFooterAction[];
    items?: SwitcherDropdownItem[];
    onSelect?: (id: string) => void;
  }) => {
    capturedFooterActions = footerActions;
    capturedItems = items;
    capturedOnSelect = onSelect;
    return <div data-testid="switcher-dropdown" />;
  },
}));

const TWO_ORGS = [
  {
    brand: null,
    id: 'org_alpha',
    // Server marks Bravo active (lastUsedOrganizationId), but the URL is Alpha —
    // the URL must win so the checkmark tracks what the user is viewing.
    isActive: false,
    label: 'Alpha',
    slug: 'alpha',
  },
  {
    brand: null,
    id: 'org_bravo',
    isActive: true,
    label: 'Bravo',
    slug: 'bravo',
  },
];

describe('OrganizationSwitcher', () => {
  beforeEach(() => {
    capturedFooterActions = [];
    capturedItems = [];
    capturedOnSelect = undefined;
    mockParams = { orgSlug: 'acme-org' };
    mockGetMyOrganizations.mockReset();
    mockSwitchOrganization.mockReset();
    mockSwitchOrganization.mockResolvedValue({
      brand: { id: 'brand_1', label: 'Default' },
      organization: { id: 'org_1', label: 'Acme Org' },
    });
    mockPush.mockReset();
    mockGetMyOrganizations.mockResolvedValue([
      {
        brand: null,
        id: 'org_1',
        isActive: true,
        label: 'Acme Org',
        slug: 'acme-org',
      },
    ]);

    // jsdom does not implement navigation; provide sp'able assign/reload.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: vi.fn(), reload: vi.fn() },
      writable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads organizations and exposes contextual row settings action', async () => {
    render(<OrganizationSwitcher />);

    await waitFor(() => {
      expect(capturedItems).toHaveLength(1);
    });

    expect(capturedItems[0]?.label).toBe('Acme Org');
    expect(capturedItems[0]?.trailingAction?.ariaLabel).toBe(
      'Open Acme Org settings',
    );
    expect(capturedFooterActions.map((action) => action.label)).toEqual([
      'New Organization',
    ]);

    capturedItems[0]?.trailingAction?.onAction();

    expect(mockPush).toHaveBeenCalledWith('/acme-org/~/settings');
  });

  it('marks the org matching the current URL slug active, overriding stale server isActive', async () => {
    mockParams = { orgSlug: 'alpha' };
    mockGetMyOrganizations.mockResolvedValue(TWO_ORGS);

    render(<OrganizationSwitcher />);

    await waitFor(() => {
      expect(capturedItems).toHaveLength(2);
    });

    const alpha = capturedItems.find((item) => item.id === 'org_alpha');
    const bravo = capturedItems.find((item) => item.id === 'org_bravo');
    expect(alpha?.isActive).toBe(true);
    expect(bravo?.isActive).toBe(false);
  });

  it('falls back to server isActive when no orgSlug is in the route', async () => {
    mockParams = {};
    mockGetMyOrganizations.mockResolvedValue(TWO_ORGS);

    render(<OrganizationSwitcher />);

    await waitFor(() => {
      expect(capturedItems).toHaveLength(2);
    });

    const alpha = capturedItems.find((item) => item.id === 'org_alpha');
    const bravo = capturedItems.find((item) => item.id === 'org_bravo');
    expect(alpha?.isActive).toBe(false);
    expect(bravo?.isActive).toBe(true);
  });

  it('persists the switch and navigates to the target org slug', async () => {
    mockParams = { orgSlug: 'alpha' };
    mockGetMyOrganizations.mockResolvedValue(TWO_ORGS);

    render(<OrganizationSwitcher />);

    await waitFor(() => {
      expect(capturedOnSelect).toBeDefined();
    });

    capturedOnSelect?.('org_bravo');

    await waitFor(() => {
      expect(mockSwitchOrganization).toHaveBeenCalledWith('org_bravo');
    });
    expect(window.location.assign).toHaveBeenCalledWith('/bravo');
    // Never reloads the current (old) org URL.
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('ignores selecting the already-active org', async () => {
    mockParams = { orgSlug: 'alpha' };
    mockGetMyOrganizations.mockResolvedValue(TWO_ORGS);

    render(<OrganizationSwitcher />);

    await waitFor(() => {
      expect(capturedOnSelect).toBeDefined();
    });

    capturedOnSelect?.('org_alpha');

    await waitFor(() => {
      expect(capturedItems).toHaveLength(2);
    });
    expect(mockSwitchOrganization).not.toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });
});
