import type { RoutedOrganizationSummary } from '@genfeedai/contexts/user/organization-context/organization-context';
import type { IDesktopRuntimeContext } from '@genfeedai/contracts/desktop';
import type { DesktopRuntimeSnapshot } from '@genfeedai/services/core/desktop-runtime.service';
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

vi.mock('@genfeedai/config/license', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config/license')>()),
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
    mockCreditsRuntime.mockReturnValue({ status: 'web', context: null });
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

  it('registers personal-scope commands with no org or brand known', () => {
    renderHook(() => useSettingsCommandsRegistration());

    const ids = getRegisteredIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(
      ids.every(
        (id) =>
          id.startsWith('settings-catalog:personal:') ||
          id.startsWith('settings-catalog:personal-section:'),
      ),
    ).toBe(true);
  });

  it('registers Personal/Notifications/Progress/Help/About — no coarse duplicate to exclude anymore (#4660 review)', () => {
    // commands.registry.ts no longer registers a reloading "Personal
    // Settings" command, so nothing here needs to be excluded as a
    // duplicate — every personal page, including the "Personal" hub itself,
    // is reachable through this client-side catalog command.
    renderHook(() => useSettingsCommandsRegistration());

    const ids = getRegisteredIds();
    expect(ids).toContain('settings-catalog:personal:/settings/personal');
    expect(ids).toContain('settings-catalog:personal:/settings/notifications');
    expect(ids).toContain('settings-catalog:personal:/settings/help');
  });

  it('does not register organization or brand commands without a known org', () => {
    renderHook(() => useSettingsCommandsRegistration());

    const ids = getRegisteredIds();
    expect(
      ids.some((id) => id.startsWith('settings-catalog:organization:')),
    ).toBe(false);
    expect(ids.some((id) => id.startsWith('settings-catalog:brand:'))).toBe(
      false,
    );
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

  it('still does not register brand commands with only an org known', () => {
    mockUseRoutedOrganization.mockReturnValue({
      status: 'unscoped',
      organizations: [] as RoutedOrganizationSummary[],
      isRouteConfirmed: true,
      confirmedOrganizationSlug: 'acme',
    });

    renderHook(() => useSettingsCommandsRegistration());

    const ids = getRegisteredIds();
    expect(ids.some((id) => id.startsWith('settings-catalog:brand:'))).toBe(
      false,
    );
  });

  it('registers brand-scope commands once an org and a session brand are both known', () => {
    mockUseRoutedOrganization.mockReturnValue({
      status: 'unscoped',
      organizations: [] as RoutedOrganizationSummary[],
      isRouteConfirmed: true,
      confirmedOrganizationSlug: 'acme',
    });
    mockUseBrand.mockReturnValue({
      selectedBrand: {
        id: 'brand-1',
        organization: { id: 'org-1', slug: 'acme' },
        slug: 'my-brand',
      },
    });

    renderHook(() => useSettingsCommandsRegistration());

    const ids = getRegisteredIds();
    expect(ids.some((id) => id.startsWith('settings-catalog:brand:'))).toBe(
      true,
    );
  });

  it('falls back to the selected brand organization when the route has no confirmed org', () => {
    mockUseRoutedOrganization.mockReturnValue({
      status: 'unscoped',
      organizations: [] as RoutedOrganizationSummary[],
      isRouteConfirmed: true,
      confirmedOrganizationSlug: null,
    });
    mockUseBrand.mockReturnValue({
      selectedBrand: {
        id: 'brand-1',
        organization: { id: 'org-1', slug: 'acme' },
        slug: 'my-brand',
      },
    });

    renderHook(() => useSettingsCommandsRegistration());

    const ids = getRegisteredIds();
    expect(
      ids.some((id) => id.startsWith('settings-catalog:organization:')),
    ).toBe(true);
    expect(ids.some((id) => id.startsWith('settings-catalog:brand:'))).toBe(
      true,
    );
  });

  it('boosts every result to priority 7 when the operator is not in a specialized module (currentApp is "workspace" or unset)', () => {
    mockUseRoutedOrganization.mockReturnValue({
      status: 'unscoped',
      organizations: [] as RoutedOrganizationSummary[],
      isRouteConfirmed: true,
      confirmedOrganizationSlug: 'acme',
    });

    renderHook(() => useSettingsCommandsRegistration('workspace'));

    const commands = mockRegisterCommands.mock.calls.at(-1)?.[0] as {
      id: string;
      priority?: number;
    }[];

    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every((command) => command.priority === 7)).toBe(true);
  });

  it('leaves results at the baseline priority when the operator is in a specialized module (#4660 review: rank by currentApp, not settings scope)', () => {
    mockUseRoutedOrganization.mockReturnValue({
      status: 'unscoped',
      organizations: [] as RoutedOrganizationSummary[],
      isRouteConfirmed: true,
      confirmedOrganizationSlug: 'acme',
    });

    renderHook(() => useSettingsCommandsRegistration('playground'));

    const commands = mockRegisterCommands.mock.calls.at(-1)?.[0] as {
      id: string;
      priority?: number;
    }[];

    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every((command) => command.priority === 5)).toBe(true);
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
      (currentApp?: 'workspace' | 'playground') =>
        useSettingsCommandsRegistration(currentApp),
      { initialProps: 'playground' },
    );

    expect(lastRegisteredPriorities().every((priority) => priority === 5)).toBe(
      true,
    );

    rerender('workspace');

    expect(lastRegisteredPriorities().every((priority) => priority === 7)).toBe(
      true,
    );
  });

  it('navigates client-side and scrolls to the anchor instead of reloading the page', () => {
    const scrollIntoView = vi.fn();
    const anchorEl = document.createElement('div');
    anchorEl.id = 'appearance';
    anchorEl.scrollIntoView = scrollIntoView;
    document.body.appendChild(anchorEl);

    renderHook(() => useSettingsCommandsRegistration());

    const commands = mockRegisterCommands.mock.calls.at(-1)?.[0] as {
      action: () => void;
      id: string;
    }[];
    const appearanceCommand = commands.find((command) =>
      command.id.endsWith('personal-section:appearance'),
    );

    act(() => appearanceCommand?.action());

    expect(mockPush).toHaveBeenCalledWith('/settings/personal#appearance', {
      scroll: false,
    });
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });

    document.body.removeChild(anchorEl);
  });

  it.each(['loading', 'switching', 'unauthorized', 'failed'])(
    'suppresses stale scopes while context is %s',
    (status) => {
      mockUseRoutedOrganization.mockReturnValue({
        status,
        organizations: [] as RoutedOrganizationSummary[],
        isRouteConfirmed: false,
        confirmedOrganizationSlug: 'acme',
      });
      mockUseBrand.mockReturnValue({
        selectedBrand: { slug: 'brand', organization: { slug: 'acme' } },
      });
      renderHook(() => useSettingsCommandsRegistration());
      expect(
        getRegisteredIds().some((id) => /:(organization|brand):/.test(id)),
      ).toBe(false);
    },
  );

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

  it.each([false, true])(
    'preserves the billing hint gate (%s)',
    (isEnabled) => {
      mockBilling.value = isEnabled;
      mockUseRoutedOrganization.mockReturnValue({
        status: 'matched',
        organizations: [] as RoutedOrganizationSummary[],
        isRouteConfirmed: true,
        confirmedOrganizationSlug: 'acme',
      });
      renderHook(() => useSettingsCommandsRegistration());
      expect(
        getRegisteredIds().includes(
          'settings-catalog:organization:/settings/subscription',
        ),
      ).toBe(isEnabled);
    },
  );

  it('unregisters everything it registered on unmount', () => {
    const { unmount } = renderHook(() => useSettingsCommandsRegistration());
    const ids = getRegisteredIds();

    unmount();

    expect(mockUnregisterCommands).toHaveBeenCalledWith(ids);
  });
});

const mockCreditsRuntime = vi.hoisted(() =>
  vi.fn<() => DesktopRuntimeSnapshot>(),
);
vi.mock(
  '@genfeedai/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context',
  () => ({
    useDesktopRuntimeContext: mockCreditsRuntime,
  }),
);

const creditsCloudContext: IDesktopRuntimeContext = {
  version: 1,
  runtimeId: 'credits-runtime',
  revision: 1,
  status: 'ready',
  selectedServerId: 'credits-cloud',
  selectedServerKind: 'cloud',
  selectedApiEndpoint: 'https://example.invalid/v1',
  runtimeMode: 'cloud',
  generationExecution: 'remote',
  localProvider: null,
};
const creditsLocalContext: IDesktopRuntimeContext = {
  ...creditsCloudContext,
  revision: 2,
  runtimeMode: 'local',
  generationExecution: 'local-byok',
  localProvider: { provider: 'ollama', networkAccess: 'local' },
};
const creditsRuntimeCases = [
  {
    name: 'cloud web',
    runtime: { status: 'web', context: null },
    allowed: true,
    selfHosted: false,
    billing: true,
    price: undefined,
  },
  {
    name: 'community self-host web',
    runtime: { status: 'web', context: null },
    allowed: true,
    selfHosted: true,
    billing: false,
    price: undefined,
  },
  {
    name: 'licensed self-host web',
    runtime: { status: 'web', context: null },
    allowed: true,
    selfHosted: true,
    billing: true,
    price: undefined,
  },
  {
    name: 'configured PAYG self-host web',
    runtime: { status: 'web', context: null },
    allowed: true,
    selfHosted: true,
    billing: false,
    price: 'price_fixture',
  },
  {
    name: 'confirmed desktop cloud without billing hint',
    runtime: { status: 'ready', context: creditsCloudContext },
    allowed: true,
    selfHosted: false,
    billing: false,
    price: undefined,
  },
  {
    name: 'local Ollama with remembered cloud and billing hint',
    runtime: { status: 'ready', context: creditsLocalContext },
    allowed: false,
    selfHosted: false,
    billing: true,
    price: undefined,
  },
  {
    name: 'local Replicate with remote network',
    runtime: {
      status: 'ready',
      context: {
        ...creditsLocalContext,
        localProvider: { provider: 'replicate', networkAccess: 'remote' },
      },
    },
    allowed: false,
    selfHosted: false,
    billing: true,
    price: undefined,
  },
  {
    name: 'local unknown execution',
    runtime: {
      status: 'ready',
      context: {
        ...creditsLocalContext,
        generationExecution: 'unknown',
        localProvider: null,
      },
    },
    allowed: false,
    selfHosted: true,
    billing: true,
    price: undefined,
  },
  {
    name: 'desktop self-host server',
    runtime: {
      status: 'ready',
      context: {
        ...creditsCloudContext,
        selectedServerId: 'credits-self-host',
        selectedServerKind: 'self-hosted',
      },
    },
    allowed: false,
    selfHosted: true,
    billing: true,
    price: undefined,
  },
  {
    name: 'cloud execution unconfirmed',
    runtime: {
      status: 'ready',
      context: { ...creditsCloudContext, generationExecution: 'unknown' },
    },
    allowed: false,
    selfHosted: false,
    billing: true,
    price: undefined,
  },
  {
    name: 'loading',
    runtime: { status: 'loading', context: null },
    allowed: false,
    selfHosted: false,
    billing: true,
    price: undefined,
  },
  {
    name: 'unavailable',
    runtime: { status: 'unavailable', context: null },
    allowed: false,
    selfHosted: false,
    billing: true,
    price: undefined,
  },
  {
    name: 'switching with old cloud context',
    runtime: { status: 'switching', context: creditsCloudContext },
    allowed: false,
    selfHosted: false,
    billing: true,
    price: undefined,
  },
] satisfies {
  name: string;
  runtime: DesktopRuntimeSnapshot;
  allowed: boolean;
  selfHosted: boolean;
  billing: boolean;
  price: string | undefined;
}[];
const creditsRuntimeTransitions: DesktopRuntimeSnapshot[] = [
  { status: 'loading', context: null },
  { status: 'ready', context: creditsLocalContext },
  { status: 'ready', context: creditsCloudContext },
  { status: 'switching', context: creditsCloudContext },
  { status: 'ready', context: creditsLocalContext },
  { status: 'ready', context: creditsCloudContext },
];

describe('desktop Credits navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccess.canRender = true;
    mockAccess.redirectTarget = null;
    mockPathname.value = '/acme/~/settings/general';
    mockUseBrand.mockReturnValue({ selectedBrand: null });
    mockUseRoutedOrganization.mockReturnValue({
      status: 'matched',
      organizations: [],
      isRouteConfirmed: true,
      confirmedOrganizationSlug: 'acme',
    });
  });
  it.each(creditsRuntimeCases)(
    '$name',
    ({ runtime, allowed, billing, selfHosted }) => {
      vi.stubEnv('GENFEED_CLOUD', selfHosted ? '0' : '1');
      vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', selfHosted ? '0' : '1');
      mockBilling.value = billing;
      mockCreditsRuntime.mockReturnValue(runtime);
      const { unmount } = renderHook(() => useSettingsCommandsRegistration());
      expect(
        getRegisteredIds().includes(
          'settings-catalog:organization:/settings/credits',
        ),
      ).toBe(allowed);
      expect(getRegisteredIds()).toContain(
        'settings-catalog:organization:/settings/general',
      );
      unmount();
    },
  );
  it('cleans up the prior IDs before registering replacements and on unmount', () => {
    mockCreditsRuntime.mockReturnValue(creditsRuntimeTransitions[0]);
    const { rerender, unmount } = renderHook(() =>
      useSettingsCommandsRegistration(),
    );
    let previousIds = getRegisteredIds();
    expect(previousIds).not.toContain(
      'settings-catalog:organization:/settings/credits',
    );
    creditsRuntimeTransitions.slice(1).forEach((runtime, offset) => {
      const allowed = offset === 1 || offset === 4;
      const wasAllowed = previousIds.includes(
        'settings-catalog:organization:/settings/credits',
      );
      mockRegisterCommands.mockClear();
      mockUnregisterCommands.mockClear();
      mockCreditsRuntime.mockReturnValue(runtime);
      rerender();
      if (allowed !== wasAllowed) {
        expect(mockUnregisterCommands).toHaveBeenCalledWith(previousIds);
        expect(mockUnregisterCommands.mock.invocationCallOrder[0]).toBeLessThan(
          mockRegisterCommands.mock.invocationCallOrder[0],
        );
        previousIds = getRegisteredIds();
      }
      expect(
        previousIds.includes('settings-catalog:organization:/settings/credits'),
      ).toBe(allowed);
      expect(previousIds).toContain(
        'settings-catalog:organization:/settings/general',
      );
    });
    mockUnregisterCommands.mockClear();
    unmount();
    expect(mockUnregisterCommands).toHaveBeenCalledWith(previousIds);
  });
});

describe('Subscription runtime boundary', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('Unexpected fetch');
      }),
    );
    vi.stubGlobal(
      'XMLHttpRequest',
      class {
        constructor() {
          throw new Error('Unexpected XHR');
        }
      },
    );
    vi.stubGlobal(
      'WebSocket',
      class {
        constructor() {
          throw new Error('Unexpected WebSocket');
        }
      },
    );
    vi.stubGlobal(
      'open',
      vi.fn(() => {
        throw new Error('Unexpected browser open');
      }),
    );

    vi.clearAllMocks();
    mockAccess.canRender = true;
    mockAccess.redirectTarget = null;
    mockPathname.value = '/acme/~/settings/general';
    mockBilling.value = true;
    mockDesktop.value = true;
    mockUseBrand.mockReturnValue({ selectedBrand: null });
    mockUseRoutedOrganization.mockReturnValue({
      status: 'matched',
      organizations: [],
      isRouteConfirmed: true,
      confirmedOrganizationSlug: 'acme',
    });
    mockCreditsRuntime.mockReturnValue({
      status: 'ready',
      context: creditsLocalContext,
    });
  });
  it('omits only Subscription from local commands with a billing hint', () => {
    const { unmount } = renderHook(() => useSettingsCommandsRegistration());
    expect(getRegisteredIds()).not.toContain(
      'settings-catalog:organization:/settings/subscription',
    );
    expect(getRegisteredIds()).toContain(
      'settings-catalog:organization:/settings/general',
    );
    unmount();
  });
  it.each([
    ['web', { status: 'web', context: null }, true],
    ['cloud', { status: 'ready', context: creditsCloudContext }, true],
    [
      'self-hosted cloud',
      {
        status: 'ready',
        context: { ...creditsCloudContext, selectedServerKind: 'self-hosted' },
      },
      true,
    ],
    [
      'unknown execution cloud',
      {
        status: 'ready',
        context: { ...creditsCloudContext, generationExecution: 'unknown' },
      },
      true,
    ],
    ['local Ollama', { status: 'ready', context: creditsLocalContext }, false],
    [
      'local remote BYOK',
      {
        status: 'ready',
        context: {
          ...creditsLocalContext,
          localProvider: { provider: 'replicate', networkAccess: 'remote' },
        },
      },
      false,
    ],
    [
      'local unknown',
      {
        status: 'ready',
        context: {
          ...creditsLocalContext,
          generationExecution: 'unknown',
          localProvider: null,
        },
      },
      false,
    ],
    ['loading', { status: 'loading', context: null }, false],
    ['unavailable', { status: 'unavailable', context: null }, false],
    [
      'switching from cloud',
      { status: 'switching', context: creditsCloudContext },
      false,
    ],
    [
      'switching from local',
      { status: 'switching', context: creditsLocalContext },
      false,
    ],
  ] satisfies [string, DesktopRuntimeSnapshot, boolean][])(
    'keeps Subscription and sibling destinations correct for %s',
    (_name, snapshot, allowed) => {
      mockCreditsRuntime.mockReturnValue(snapshot);
      const { unmount } = renderHook(() => useSettingsCommandsRegistration());
      expect(
        getRegisteredIds().includes(
          'settings-catalog:organization:/settings/subscription',
        ),
      ).toBe(allowed);
      expect(getRegisteredIds()).toEqual(
        expect.arrayContaining([
          'settings-catalog:organization:/settings/general',
          'settings-catalog:organization:/settings/memory',
          'settings-catalog:organization:/settings/referrals',
        ]),
      );
      unmount();
    },
  );
  it.each(['cloud', 'self-hosted'] as const)(
    'cleans prior %s commands before replacements and unregisters the final list',
    (selectedServerKind) => {
      const cloud: IDesktopRuntimeContext = {
        ...creditsCloudContext,
        selectedServerKind,
      };
      const transitions: [DesktopRuntimeSnapshot, boolean][] = [
        [{ status: 'web', context: null }, true],
        [{ status: 'ready', context: cloud }, true],
        [{ status: 'switching', context: cloud }, false],
        [{ status: 'ready', context: creditsLocalContext }, false],
        [{ status: 'ready', context: cloud }, true],
        [{ status: 'unavailable', context: null }, false],
        [{ status: 'ready', context: cloud }, true],
        [{ status: 'ready', context: creditsLocalContext }, false],
        [{ status: 'ready', context: cloud }, true],
      ];
      mockCreditsRuntime.mockReturnValue({ status: 'loading', context: null });
      const { rerender, unmount } = renderHook(() =>
        useSettingsCommandsRegistration(),
      );
      let previousIds = getRegisteredIds();
      expect(previousIds).not.toContain(
        'settings-catalog:organization:/settings/subscription',
      );
      for (const [snapshot, allowed] of transitions) {
        mockRegisterCommands.mockClear();
        mockUnregisterCommands.mockClear();
        mockCreditsRuntime.mockReturnValue(snapshot);
        rerender();
        if (mockRegisterCommands.mock.calls.length > 0) {
          expect(mockUnregisterCommands).toHaveBeenCalledWith(previousIds);
          expect(
            mockUnregisterCommands.mock.invocationCallOrder[0],
          ).toBeLessThan(mockRegisterCommands.mock.invocationCallOrder[0]);
          previousIds = getRegisteredIds();
        }
        expect(
          previousIds.includes(
            'settings-catalog:organization:/settings/subscription',
          ),
        ).toBe(allowed);
        expect(previousIds).toEqual(
          expect.arrayContaining([
            'settings-catalog:organization:/settings/general',
            'settings-catalog:organization:/settings/memory',
            'settings-catalog:organization:/settings/referrals',
          ]),
        );
      }
      mockUnregisterCommands.mockClear();
      unmount();
      expect(mockUnregisterCommands).toHaveBeenCalledWith(previousIds);
    },
  );
  it('keeps the original billing-hint denial for community and unlicensed desktop web snapshots', () => {
    mockBilling.value = false;
    mockCreditsRuntime.mockReturnValue({ status: 'web', context: null });
    const { unmount } = renderHook(() => useSettingsCommandsRegistration());
    expect(getRegisteredIds()).not.toContain(
      'settings-catalog:organization:/settings/subscription',
    );
    unmount();
  });
});
