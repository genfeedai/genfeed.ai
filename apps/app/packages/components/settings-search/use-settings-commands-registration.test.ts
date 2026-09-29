import type { RoutedOrganizationSummary } from '@genfeedai/contexts/user/organization-context/organization-context';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPathname = vi.hoisted(() => ({ value: '/settings/personal' }));
const mockAccess = vi.hoisted(() => ({
  canRender: true,
  redirectTarget: null as string | null,
}));
const mockAuthEnabled = vi.hoisted(() => ({ value: true }));
vi.mock('@genfeedai/auth-client', () => ({
  isBetterAuthEnabled: () => mockAuthEnabled.value,
}));
const mockDesktop = vi.hoisted(() => ({ value: false }));
const mockBilling = vi.hoisted(() => ({ value: false }));
vi.mock(
  '@genfeedai/hooks/navigation/use-onboarding-route-access/use-onboarding-route-access',
  () => ({ useOnboardingRouteAccess: () => mockAccess }),
);
vi.mock(
  '@genfeedai/hooks/ui/use-is-desktop-client/use-is-desktop-client',
  () => ({ useIsDesktopClient: () => mockDesktop.value }),
);
const mockPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.value,
  useRouter: () => ({ push: mockPush }),
}));

const mockRegisterCommands = vi.hoisted(() =>
  vi.fn((commands: { id: string }[]) => commands.map((command) => command.id)),
);
const mockUnregisterCommands = vi.hoisted(() => vi.fn());

vi.mock('@genfeedai/services/core/command-palette.service', () => ({
  CommandPaletteService: {
    registerCommands: mockRegisterCommands,
    unregisterCommands: mockUnregisterCommands,
  },
}));

const mockUseBrand = vi.hoisted(() =>
  vi.fn(() => ({ selectedBrand: null as unknown })),
);
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: mockUseBrand,
}));

const mockUseRoutedOrganization = vi.hoisted(() =>
  vi.fn(() => ({
    confirmedOrganizationSlug: null as string | null,
    status: 'unscoped',
    organizations: [] as RoutedOrganizationSummary[],
    isRouteConfirmed: true,
  })),
);
vi.mock(
  '@genfeedai/contexts/user/organization-context/organization-context',
  () => ({
    useRoutedOrganization: mockUseRoutedOrganization,
  }),
);

vi.mock('@genfeedai/config/license', () => ({
  hasOrganizationBillingHint: () => mockBilling.value,
}));

import { useSettingsCommandsRegistration } from './use-settings-commands-registration';

function getRegisteredIds(): string[] {
  const commands = mockRegisterCommands.mock.calls.at(-1)?.[0] as
    | { id: string }[]
    | undefined;
  return (commands ?? []).map((command) => command.id);
}

describe('useSettingsCommandsRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthEnabled.value = true;
    mockAccess.canRender = true;
    mockAccess.redirectTarget = null;
    mockDesktop.value = false;
    mockBilling.value = false;
    mockPathname.value = '/settings/personal';
    window.history.replaceState({}, '', '/settings/personal');
    mockRegisterCommands.mockImplementation((commands: { id: string }[]) =>
      commands.map((command) => command.id),
    );
    mockUseBrand.mockReturnValue({ selectedBrand: null });
    mockUseRoutedOrganization.mockReturnValue({
      status: 'unscoped',
      organizations: [] as RoutedOrganizationSummary[],
      isRouteConfirmed: true,
      confirmedOrganizationSlug: null,
    });
  });

  it('registers organization-scope commands once an org is confirmed, including General/Brands/Credits (#4660 review)', () => {
    mockUseRoutedOrganization.mockReturnValue({
      status: 'unscoped',
      organizations: [] as RoutedOrganizationSummary[],
      isRouteConfirmed: true,
      confirmedOrganizationSlug: 'acme',
    });

    renderHook(() => useSettingsCommandsRegistration());

    const ids = getRegisteredIds();
    expect(ids).toContain('settings-catalog:organization:/settings/members');
    // No longer excluded — commands.registry.ts no longer registers
    // reloading duplicates of these destinations.
    expect(ids).toContain('settings-catalog:organization:/settings/general');
    expect(ids).toContain('settings-catalog:organization:/settings/brands');
    expect(ids).toContain('settings-catalog:organization:/settings/credits');
  });

  it('re-registers with the boosted priority when currentApp changes', () => {
    function lastRegisteredPriorities(): (number | undefined)[] {
      const commands =
        (mockRegisterCommands.mock.calls.at(-1)?.[0] as
          | { priority?: number }[]
          | undefined) ?? [];
      return commands.map((command) => command.priority);
    }

    const { rerender } = renderHook(
      (currentApp?: 'workspace' | 'studio') =>
        useSettingsCommandsRegistration(currentApp),
      { initialProps: 'studio' },
    );

    expect(lastRegisteredPriorities().every((priority) => priority === 5)).toBe(
      true,
    );

    rerender('workspace');

    expect(lastRegisteredPriorities().every((priority) => priority === 7)).toBe(
      true,
    );
  });

  it.each([false, true])(
    'requires a scoped organization route to be confirmed (%s)',
    (isRouteConfirmed) => {
      mockPathname.value = '/acme/~/settings/general';
      mockUseRoutedOrganization.mockReturnValue({
        status: 'matched',
        organizations: [],
        isRouteConfirmed,
        confirmedOrganizationSlug: 'acme',
      });
      const { rerender } = renderHook(() => useSettingsCommandsRegistration());
      expect(
        getRegisteredIds().some((id) => id.includes(':organization:')),
      ).toBe(isRouteConfirmed);
      mockUseRoutedOrganization.mockReturnValue({
        status: 'matched',
        organizations: [] as RoutedOrganizationSummary[],
        isRouteConfirmed: true,
        confirmedOrganizationSlug: 'other',
      });
      rerender();
      expect(
        getRegisteredIds().some((id) => id.includes(':organization:')),
      ).toBe(false);
    },
  );

  it.each([false, true])(
    'uses the known active organization on an unscoped host (stale brand: %s)',
    (hasStaleBrand) => {
      mockUseRoutedOrganization.mockReturnValue({
        confirmedOrganizationSlug: null,
        isRouteConfirmed: true,
        status: 'unscoped',
        organizations: [
          {
            id: 'org-acme',
            slug: 'acme',
            label: 'Acme',
            isActive: true,
            brand: null,
          },
        ],
      });
      if (hasStaleBrand)
        mockUseBrand.mockReturnValue({
          selectedBrand: {
            slug: 'stale-brand',
            organization: { slug: 'other' },
          },
        });
      renderHook(() => useSettingsCommandsRegistration());
      const commands = mockRegisterCommands.mock.calls.at(-1)?.[0] as {
        id: string;
        action: () => void;
      }[];
      const organizationCommand = commands.find(
        (command) =>
          command.id === 'settings-catalog:organization:/settings/general',
      );
      expect(organizationCommand).toBeDefined();
      act(() => organizationCommand?.action());
      expect(mockPush).toHaveBeenCalledWith('/acme/~/settings/general');
      expect(getRegisteredIds().some((id) => id.includes(':brand:'))).toBe(
        false,
      );
    },
  );

  it.each([null, 'acme', 'other'])(
    'preserves keyless scoped organization access with brand organization %s',
    (brandOrgSlug) => {
      mockAuthEnabled.value = false;
      mockPathname.value = '/acme/~/settings/general';
      mockUseRoutedOrganization.mockReturnValue({
        confirmedOrganizationSlug: null,
        isRouteConfirmed: true,
        organizations: [],
        status: 'unscoped',
      });
      if (brandOrgSlug)
        mockUseBrand.mockReturnValue({
          selectedBrand: {
            slug: 'selected-brand',
            organization: { slug: brandOrgSlug },
          },
        });
      renderHook(() => useSettingsCommandsRegistration());
      const commands = mockRegisterCommands.mock.calls.at(-1)?.[0] as {
        id: string;
        action: () => void;
      }[];
      const organizationCommand = commands.find(
        (command) =>
          command.id === 'settings-catalog:organization:/settings/general',
      );
      expect(organizationCommand).toBeDefined();
      act(() => organizationCommand?.action());
      expect(mockPush).toHaveBeenCalledWith('/acme/~/settings/general');
      expect(getRegisteredIds().some((id) => id.includes(':brand:'))).toBe(
        brandOrgSlug === 'acme',
      );
    },
  );

  it('does not apply the keyless scoped bypass when authentication is enabled', () => {
    mockPathname.value = '/acme/~/settings/general';
    mockUseRoutedOrganization.mockReturnValue({
      confirmedOrganizationSlug: null,
      isRouteConfirmed: true,
      organizations: [],
      status: 'unscoped',
    });
    mockUseBrand.mockReturnValue({
      selectedBrand: { slug: 'selected-brand', organization: { slug: 'acme' } },
    });
    renderHook(() => useSettingsCommandsRegistration());
    expect(
      getRegisteredIds().some((id) => /:(organization|brand):/.test(id)),
    ).toBe(false);
  });

  it('keeps the confirmed organization but omits a brand from another organization', () => {
    mockUseRoutedOrganization.mockReturnValue({
      status: 'matched',
      organizations: [] as RoutedOrganizationSummary[],
      isRouteConfirmed: true,
      confirmedOrganizationSlug: 'acme',
    });
    mockUseBrand.mockReturnValue({
      selectedBrand: { slug: 'brand', organization: { slug: 'other' } },
    });
    renderHook(() => useSettingsCommandsRegistration());
    expect(getRegisteredIds().some((id) => id.includes(':organization:'))).toBe(
      true,
    );
    expect(getRegisteredIds().some((id) => id.includes(':brand:'))).toBe(false);
  });

  it('unregisters settings when destination access becomes blocked and preserves desktop bypass', () => {
    const { rerender } = renderHook(() => useSettingsCommandsRegistration());
    const ids = getRegisteredIds();
    mockAccess.canRender = false;
    mockAccess.redirectTarget = '/onboarding/brand';
    mockRegisterCommands.mockClear();
    rerender();
    expect(mockUnregisterCommands).toHaveBeenCalledWith(ids);
    expect(mockRegisterCommands).not.toHaveBeenCalled();
    mockDesktop.value = true;
    rerender();
    expect(getRegisteredIds().length).toBeGreaterThan(0);
  });
});
