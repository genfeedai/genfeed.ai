import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.hoisted(() => vi.fn());
const mockRouteParams = vi.hoisted(() => ({
  brandSlug: undefined as string | undefined,
  orgSlug: undefined as string | undefined,
}));

vi.mock('next/navigation', () => ({
  useParams: () => mockRouteParams,
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
    mockRouteParams.brandSlug = undefined;
    mockRouteParams.orgSlug = undefined;
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

  it('excludes the personal "Personal" hub item as a duplicate of the coarse settings-personal command', () => {
    renderHook(() => useSettingsCommandsRegistration());

    const ids = getRegisteredIds();
    expect(ids).not.toContain('settings-catalog:personal:/settings/personal');
    // Its sibling account pages stay — they are the whole point of the catalog.
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

  it('registers organization-scope commands once an org is confirmed', () => {
    mockUseRoutedOrganization.mockReturnValue({
      confirmedOrganizationSlug: 'acme',
    });

    renderHook(() => useSettingsCommandsRegistration());

    const ids = getRegisteredIds();
    expect(ids).toContain('settings-catalog:organization:/settings/members');
    // Duplicates of the coarse settings-org/settings-brands/settings-billing.
    expect(ids).not.toContain(
      'settings-catalog:organization:/settings/general',
    );
    expect(ids).not.toContain('settings-catalog:organization:/settings/brands');
    expect(ids).not.toContain(
      'settings-catalog:organization:/settings/credits',
    );
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

  it('boosts the priority of results matching the settings page currently on screen', () => {
    mockRouteParams.orgSlug = 'acme';
    mockUseRoutedOrganization.mockReturnValue({
      confirmedOrganizationSlug: 'acme',
    });

    renderHook(() => useSettingsCommandsRegistration());

    const commands = mockRegisterCommands.mock.calls.at(-1)?.[0] as {
      id: string;
      priority?: number;
    }[];
    const orgItem = commands.find(
      (command) =>
        command.id === 'settings-catalog:organization:/settings/members',
    );
    const personalItem = commands.find((command) =>
      command.id.startsWith('settings-catalog:personal:'),
    );

    expect(orgItem?.priority).toBe(7);
    expect(personalItem?.priority).toBe(5);
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
