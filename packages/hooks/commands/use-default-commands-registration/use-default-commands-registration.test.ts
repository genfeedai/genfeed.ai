import { useDefaultCommandsRegistration } from '@hooks/commands/use-default-commands-registration/use-default-commands-registration';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const DEFAULT_COMMAND_IDS = ['nav-overview', 'nav-settings', 'action-refresh'];

vi.mock('@genfeedai/services/core/commands.registry', () => ({
  registerDefaultCommands: vi.fn(() => [
    'nav-overview',
    'nav-settings',
    'action-refresh',
  ]),
}));

vi.mock('@genfeedai/services/core/command-palette.service', () => ({
  CommandPaletteService: {
    unregisterCommands: vi.fn(),
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockUseBrand = vi.hoisted(() =>
  vi.fn(() => ({
    selectedBrand: {
      id: 'brand-id',
      organization: { id: 'org-id', slug: 'test-org' },
      slug: 'test-brand',
    },
  })),
);

const mockUseRoutedOrganization = vi.hoisted(() =>
  vi.fn(() => ({
    confirmedOrganizationSlug: 'test-org',
  })),
);

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: mockUseBrand,
}));

vi.mock(
  '@genfeedai/contexts/user/organization-context/organization-context',
  () => ({
    useRoutedOrganization: mockUseRoutedOrganization,
  }),
);

import { CommandPaletteService } from '@genfeedai/services/core/command-palette.service';
import { registerDefaultCommands } from '@genfeedai/services/core/commands.registry';
import { logger } from '@genfeedai/services/core/logger.service';

describe('useDefaultCommandsRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (registerDefaultCommands as ReturnType<typeof vi.fn>).mockReturnValue(
      DEFAULT_COMMAND_IDS,
    );
    mockUseRoutedOrganization.mockReturnValue({
      confirmedOrganizationSlug: 'test-org',
    });
    mockUseBrand.mockReturnValue({
      selectedBrand: {
        id: 'brand-id',
        organization: { id: 'org-id', slug: 'test-org' },
        slug: 'test-brand',
      },
    });
  });

  it('registers default commands on mount with the confirmed org and selected brand', async () => {
    renderHook(() => useDefaultCommandsRegistration());

    await waitFor(() => {
      expect(registerDefaultCommands).toHaveBeenCalledTimes(1);
      expect(registerDefaultCommands).toHaveBeenCalledWith({
        brandSlug: 'test-brand',
        orgSlug: 'test-org',
      });
    });

    expect(logger.debug).toHaveBeenCalledWith(
      'Command palette initialized with default commands',
    );
  });

  it('still registers with an empty org when the route is unscoped and no brand is selected', async () => {
    mockUseRoutedOrganization.mockReturnValue({
      confirmedOrganizationSlug: null,
    });
    mockUseBrand.mockReturnValue({ selectedBrand: null });

    renderHook(() => useDefaultCommandsRegistration());

    await waitFor(() => {
      expect(registerDefaultCommands).toHaveBeenCalledWith({
        brandSlug: '',
        orgSlug: '',
      });
    });
  });

  it('falls back to the selected brand organization when the route has no confirmed org (e.g. /settings/personal)', async () => {
    mockUseRoutedOrganization.mockReturnValue({
      confirmedOrganizationSlug: null,
    });

    renderHook(() => useDefaultCommandsRegistration());

    await waitFor(() => {
      expect(registerDefaultCommands).toHaveBeenCalledWith({
        brandSlug: 'test-brand',
        orgSlug: 'test-org',
      });
    });
  });

  it('unregisters the registered commands on unmount', async () => {
    const { unmount } = renderHook(() => useDefaultCommandsRegistration());

    await waitFor(() => {
      expect(registerDefaultCommands).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(CommandPaletteService.unregisterCommands).toHaveBeenCalledTimes(1);
    expect(CommandPaletteService.unregisterCommands).toHaveBeenCalledWith(
      DEFAULT_COMMAND_IDS,
    );
  });

  it('re-registers after remount without leaving stale registrations (re-navigation)', async () => {
    // Simulates navigating away and back (e.g. to /settings): the initializer
    // unmounts, cleanup unregisters, and the remount registers fresh —
    // no duplicate-registration path.
    const first = renderHook(() => useDefaultCommandsRegistration());
    await waitFor(() => {
      expect(registerDefaultCommands).toHaveBeenCalledTimes(1);
    });

    first.unmount();
    expect(CommandPaletteService.unregisterCommands).toHaveBeenCalledWith(
      DEFAULT_COMMAND_IDS,
    );

    const second = renderHook(() => useDefaultCommandsRegistration());
    await waitFor(() => {
      expect(registerDefaultCommands).toHaveBeenCalledTimes(2);
    });

    // Every registration is paired with a cleanup — nothing left behind
    // to collide with, so the service never warns.
    second.unmount();
    expect(CommandPaletteService.unregisterCommands).toHaveBeenCalledTimes(2);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('unregisters old and registers new commands when the brand changes', async () => {
    const { rerender } = renderHook(() => useDefaultCommandsRegistration());

    await waitFor(() => {
      expect(registerDefaultCommands).toHaveBeenCalledWith({
        brandSlug: 'test-brand',
        orgSlug: 'test-org',
      });
    });

    mockUseBrand.mockReturnValue({
      selectedBrand: {
        id: 'other-brand-id',
        organization: { id: 'org-id', slug: 'test-org' },
        slug: 'other-brand',
      },
    });
    rerender();

    await waitFor(() => {
      expect(registerDefaultCommands).toHaveBeenCalledWith({
        brandSlug: 'other-brand',
        orgSlug: 'test-org',
      });
    });

    expect(CommandPaletteService.unregisterCommands).toHaveBeenCalledWith(
      DEFAULT_COMMAND_IDS,
    );
  });

  it('does not unregister anything when registration failed', async () => {
    (registerDefaultCommands as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        throw new Error('boom');
      },
    );

    const { unmount } = renderHook(() => useDefaultCommandsRegistration());

    await waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to initialize command palette',
        {
          error: expect.any(Error),
        },
      );
    });

    unmount();

    expect(CommandPaletteService.unregisterCommands).not.toHaveBeenCalled();
  });
});
