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

vi.mock('@hooks/navigation/use-org-url/use-org-url', () => ({
  useOrgUrl: vi.fn(() => ({
    brandSlug: 'test-brand',
    href: (path: string) => `/test-org/test-brand${path}`,
    orgHref: (path: string) => `/test-org/~${path}`,
    orgSlug: 'test-org',
  })),
}));

import { CommandPaletteService } from '@genfeedai/services/core/command-palette.service';
import { registerDefaultCommands } from '@genfeedai/services/core/commands.registry';
import { logger } from '@genfeedai/services/core/logger.service';
import { useOrgUrl } from '@hooks/navigation/use-org-url/use-org-url';

describe('useDefaultCommandsRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (registerDefaultCommands as ReturnType<typeof vi.fn>).mockReturnValue(
      DEFAULT_COMMAND_IDS,
    );
    (useOrgUrl as ReturnType<typeof vi.fn>).mockReturnValue({
      brandSlug: 'test-brand',
      href: (path: string) => `/test-org/test-brand${path}`,
      orgHref: (path: string) => `/test-org/~${path}`,
      orgSlug: 'test-org',
    });
  });

  it('registers default commands on mount with org context', async () => {
    renderHook(() => useDefaultCommandsRegistration());

    await waitFor(() => {
      expect(registerDefaultCommands).toHaveBeenCalledTimes(1);
      expect(registerDefaultCommands).toHaveBeenCalledWith(
        'test-org',
        'test-brand',
      );
    });

    expect(logger.info).toHaveBeenCalledWith(
      'Command palette initialized with default commands',
    );
  });

  it('does not register commands when orgSlug is empty', async () => {
    (useOrgUrl as ReturnType<typeof vi.fn>).mockReturnValue({
      brandSlug: 'test-brand',
      href: (path: string) => `/test-brand${path}`,
      orgHref: (path: string) => `/~${path}`,
      orgSlug: '',
    });

    renderHook(() => useDefaultCommandsRegistration());

    await waitFor(() => {
      expect(registerDefaultCommands).not.toHaveBeenCalled();
    });
  });

  it('does not register commands when brandSlug is empty', async () => {
    (useOrgUrl as ReturnType<typeof vi.fn>).mockReturnValue({
      brandSlug: '',
      href: (path: string) => `/test-org${path}`,
      orgHref: (path: string) => `/test-org/~${path}`,
      orgSlug: 'test-org',
    });

    renderHook(() => useDefaultCommandsRegistration());

    await waitFor(() => {
      expect(registerDefaultCommands).not.toHaveBeenCalled();
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
    const orgUrlMock = useOrgUrl as ReturnType<typeof vi.fn>;
    const { rerender } = renderHook(() => useDefaultCommandsRegistration());

    await waitFor(() => {
      expect(registerDefaultCommands).toHaveBeenCalledWith(
        'test-org',
        'test-brand',
      );
    });

    orgUrlMock.mockReturnValue({
      brandSlug: 'other-brand',
      href: (path: string) => `/test-org/other-brand${path}`,
      orgHref: (path: string) => `/test-org/~${path}`,
      orgSlug: 'test-org',
    });
    rerender();

    await waitFor(() => {
      expect(registerDefaultCommands).toHaveBeenCalledWith(
        'test-org',
        'other-brand',
      );
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
