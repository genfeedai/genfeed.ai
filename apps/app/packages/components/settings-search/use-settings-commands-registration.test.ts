import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
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
  vi.fn(() => ({ confirmedOrganizationSlug: null as string | null })),
);
vi.mock(
  '@genfeedai/contexts/user/organization-context/organization-context',
  () => ({
    useRoutedOrganization: mockUseRoutedOrganization,
  }),
);

vi.mock('@genfeedai/config/license', () => ({
  hasOrganizationBillingHint: () => false,
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
    mockRegisterCommands.mockImplementation((commands: { id: string }[]) =>
      commands.map((command) => command.id),
    );
    mockUseBrand.mockReturnValue({ selectedBrand: null });
    mockUseRoutedOrganization.mockReturnValue({
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
      confirmedOrganizationSlug: 'acme',
    });

    renderHook(() => useSettingsCommandsRegistration('studio'));

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

    appearanceCommand?.action();

    expect(mockPush).toHaveBeenCalledWith('/settings/personal#appearance');
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });

    document.body.removeChild(anchorEl);
  });

  it('unregisters everything it registered on unmount', () => {
    const { unmount } = renderHook(() => useSettingsCommandsRegistration());
    const ids = getRegisteredIds();

    unmount();

    expect(mockUnregisterCommands).toHaveBeenCalledWith(ids);
  });
});
