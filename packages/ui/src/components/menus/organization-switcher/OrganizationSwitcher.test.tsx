import type {
  SwitcherDropdownFooterAction,
  SwitcherDropdownItem,
} from '@genfeedai/props/ui/menus/switcher-dropdown.props';
import { render, screen, waitFor } from '@testing-library/react';
import OrganizationSwitcher from '@ui/menus/organization-switcher/OrganizationSwitcher';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();
const mockGetMyOrganizations = vi.fn();
const mockSwitchOrganization = vi.fn();
let mockOrganizations: typeof TWO_ORGS | Array<(typeof TWO_ORGS)[number]> = [];
let mockConfirmedOrganizationId: string | null = 'org_1';
let mockOrganizationStatus = 'matched';
let mockParams: { orgSlug?: string } = { orgSlug: 'acme-org' };
let mockPathname = '/acme-org/~/agent/new';
let capturedFooterActions: SwitcherDropdownFooterAction[] = [];
let capturedItems: SwitcherDropdownItem[] = [];
let capturedOnSelect: ((id: string) => void) | undefined;
let capturedIsLoading: boolean | undefined;
let capturedEmptyMessage: string | undefined;
let mockIsSubscriptionActive = true;
let mockSubscriptionTier: string | null = 'scale';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
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

vi.mock(
  '@genfeedai/contexts/user/organization-context/organization-context',
  () => ({
    useRoutedOrganization: () => ({
      confirmedOrganizationId: mockConfirmedOrganizationId,
      organizations: mockOrganizations,
      status: mockOrganizationStatus,
      switchOrganization: mockSwitchOrganization,
    }),
  }),
);

vi.mock(
  '@genfeedai/hooks/data/subscription/use-subscription/use-subscription',
  () => ({
    useSubscription: () => ({
      isSubscriptionActive: mockIsSubscriptionActive,
    }),
  }),
);

vi.mock('@genfeedai/services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@ui/menus/switcher-dropdown/SwitcherDropdown', () => ({
  default: ({
    footerActions = [],
    isLoading,
    items = [],
    emptyMessage,
    onSelect,
    renderTrigger,
  }: {
    footerActions?: SwitcherDropdownFooterAction[];
    isLoading?: boolean;
    items?: SwitcherDropdownItem[];
    emptyMessage?: string;
    onSelect?: (id: string) => void;
    renderTrigger?: (state: {
      isDisabled: boolean;
      isOpen: boolean;
    }) => ReactNode;
  }) => {
    capturedFooterActions = footerActions;
    capturedItems = items;
    capturedIsLoading = isLoading;
    capturedEmptyMessage = emptyMessage;
    capturedOnSelect = onSelect;
    return (
      <div data-testid="switcher-dropdown">
        {renderTrigger?.({ isDisabled: false, isOpen: false })}
      </div>
    );
  },
}));

const TWO_ORGS = [
  {
    brand: null,
    id: 'org_alpha',
    // Server marks Bravo active (lastUsedOrganizationId), but the URL is Alpha —
    // the URL must win so the checkmark tracks what the user is viewing.
    isActive: false,
    isOwner: true,
    label: 'Alpha',
    slug: 'alpha',
  },
  {
    brand: null,
    id: 'org_bravo',
    isActive: true,
    isOwner: false,
    label: 'Bravo',
    slug: 'bravo',
  },
];

function renderSwitcher() {
  return render(
    <OrganizationSwitcher subscriptionTier={mockSubscriptionTier} />,
  );
}

describe('OrganizationSwitcher', () => {
  beforeEach(() => {
    capturedFooterActions = [];
    capturedItems = [];
    capturedIsLoading = undefined;
    capturedEmptyMessage = undefined;
    capturedOnSelect = undefined;
    mockIsSubscriptionActive = true;
    mockSubscriptionTier = 'scale';
    mockOrganizationStatus = 'matched';
    mockParams = { orgSlug: 'acme-org' };
    mockPathname = '/acme-org/~/agent/new';
    mockGetMyOrganizations.mockReset();
    mockSwitchOrganization.mockReset();
    mockPush.mockReset();
    mockOrganizations = [
      {
        brand: null,
        id: 'org_1',
        isActive: true,
        isOwner: true,
        label: 'Acme Org',
        slug: 'acme-org',
      },
    ];
    mockConfirmedOrganizationId = 'org_1';
    mockSwitchOrganization.mockImplementation(async (organizationId) => {
      return (
        mockOrganizations.find(
          (organization) => organization.id === organizationId,
        )?.slug ?? null
      );
    });

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
    renderSwitcher();

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

    expect(capturedItems[0]?.trailingAction?.href).toBe('/acme-org/~/settings');
    expect(capturedItems[0]?.trailingAction?.target).toBe('_blank');
  });

  it('hides organization creation when the subscription is inactive', async () => {
    mockIsSubscriptionActive = false;

    renderSwitcher();

    await waitFor(() => {
      expect(capturedItems).toHaveLength(1);
    });

    expect(capturedFooterActions).toEqual([]);
  });

  it('hides organization creation when the plan has reached its org limit', async () => {
    mockSubscriptionTier = 'pro';

    renderSwitcher();

    await waitFor(() => {
      expect(capturedItems).toHaveLength(1);
    });

    expect(capturedFooterActions).toEqual([]);
  });

  it('allows organization creation when a capped plan only belongs to another org', async () => {
    mockSubscriptionTier = 'pro';
    mockOrganizations = [
      {
        brand: null,
        id: 'org_member',
        isActive: true,
        isOwner: false,
        label: 'Client Org',
        slug: 'client-org',
      },
    ];
    mockConfirmedOrganizationId = 'org_member';

    renderSwitcher();

    await waitFor(() => {
      expect(capturedItems).toHaveLength(1);
    });

    expect(capturedFooterActions.map((action) => action.label)).toEqual([
      'New Organization',
    ]);
  });

  it('allows organization creation on unlimited-org tiers', async () => {
    mockSubscriptionTier = 'scale';

    renderSwitcher();

    await waitFor(() => {
      expect(capturedItems).toHaveLength(1);
    });

    expect(capturedFooterActions.map((action) => action.label)).toEqual([
      'New Organization',
    ]);
  });

  it('renders the sidebar trigger with compact spacing and a square avatar', async () => {
    renderSwitcher();

    await waitFor(() => {
      expect(screen.getByText('Acme Org')).toBeInTheDocument();
    });

    const trigger = screen.getByText('Acme Org').closest('div');
    const avatar = trigger?.querySelector('.size-6');

    expect(trigger).toHaveClass('h-8', 'gap-2', 'px-2.5', 'rounded-md');
    expect(avatar).toHaveClass('rounded-md');
    expect(avatar).not.toHaveClass('rounded-full');
  });

  it('passes the context loading state to the dropdown', async () => {
    mockOrganizationStatus = 'loading';
    mockOrganizations = [];
    mockConfirmedOrganizationId = null;

    renderSwitcher();

    expect(capturedIsLoading).toBe(true);
    expect(capturedItems).toEqual([]);
    expect(capturedEmptyMessage).toBe('No organizations');
  });

  it('marks only the organization confirmed by routed context active', async () => {
    mockParams = { orgSlug: 'alpha' };
    mockOrganizations = TWO_ORGS;
    mockConfirmedOrganizationId = 'org_alpha';

    renderSwitcher();

    await waitFor(() => {
      expect(capturedItems).toHaveLength(2);
    });

    const alpha = capturedItems.find((item) => item.id === 'org_alpha');
    const bravo = capturedItems.find((item) => item.id === 'org_bravo');
    expect(alpha?.isActive).toBe(true);
    expect(bravo?.isActive).toBe(false);
  });

  it('uses confirmed context rather than optimistic route state', async () => {
    mockParams = {};
    mockOrganizations = TWO_ORGS;
    mockConfirmedOrganizationId = 'org_bravo';

    renderSwitcher();

    await waitFor(() => {
      expect(capturedItems).toHaveLength(2);
    });

    const alpha = capturedItems.find((item) => item.id === 'org_alpha');
    const bravo = capturedItems.find((item) => item.id === 'org_bravo');
    expect(alpha?.isActive).toBe(false);
    expect(bravo?.isActive).toBe(true);
  });

  it('does not infer an active organization when context is unresolved', async () => {
    mockParams = { orgSlug: 'default' };
    mockOrganizations = [
      {
        brand: null,
        id: 'org_solo',
        isActive: false,
        isOwner: true,
        label: 'Solo Org',
        slug: 'solo-org',
      },
    ];
    mockConfirmedOrganizationId = null;

    renderSwitcher();

    await waitFor(() => {
      expect(capturedItems).toHaveLength(1);
    });

    expect(capturedItems[0]).toEqual(
      expect.objectContaining({ id: 'org_solo', isActive: false }),
    );
  });

  it('persists the switch and client-navigates to the same surface in the target org', async () => {
    mockParams = { orgSlug: 'alpha' };
    mockPathname = '/alpha/moonrise/library/assets';
    mockOrganizations = TWO_ORGS;
    mockConfirmedOrganizationId = 'org_alpha';

    renderSwitcher();

    await waitFor(() => {
      expect(capturedOnSelect).toBeDefined();
    });

    capturedOnSelect?.('org_bravo');

    await waitFor(() => {
      expect(mockSwitchOrganization).toHaveBeenCalledWith('org_bravo');
    });
    expect(mockPush).toHaveBeenCalledWith('/bravo/~/library/assets');
    expect(window.location.assign).not.toHaveBeenCalled();
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('ignores selecting the already-active org', async () => {
    mockParams = { orgSlug: 'alpha' };
    mockOrganizations = TWO_ORGS;
    mockConfirmedOrganizationId = 'org_alpha';

    renderSwitcher();

    await waitFor(() => {
      expect(capturedOnSelect).toBeDefined();
    });

    capturedOnSelect?.('org_alpha');

    await waitFor(() => {
      expect(capturedItems).toHaveLength(2);
    });
    expect(mockSwitchOrganization).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });
});
