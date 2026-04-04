import type { ICommand } from '@genfeedai/interfaces/ui/command-palette.interface';
import { useAdminCommandRegistration } from '@hooks/commands/use-admin-command-registration/use-admin-command-registration';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('useAdminCommandRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers the admin command when loaded and super admin', async () => {
    const registerCommand = vi.fn();
    const unregisterCommand = vi.fn();

    const { unmount } = renderHook(() =>
      useAdminCommandRegistration({
        isLoaded: true,
        isSuperAdmin: true,
        registerCommand,
        unregisterCommand,
      }),
    );

    await waitFor(() => {
      expect(registerCommand).toHaveBeenCalledTimes(1);
    });

    const command = registerCommand.mock.calls[0]?.[0] as ICommand;
    expect(command.id).toBe('nav-admin');
    expect(typeof command.action).toBe('function');
    expect(typeof command.condition).toBe('function');

    unmount();

    expect(unregisterCommand).toHaveBeenCalledWith('nav-admin');
  });

  it('does not register when not loaded', async () => {
    const registerCommand = vi.fn();

    renderHook(() =>
      useAdminCommandRegistration({
        isLoaded: false,
        isSuperAdmin: true,
        registerCommand,
        unregisterCommand: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(registerCommand).not.toHaveBeenCalled();
    });
  });

  it('does not register when user is not super admin', async () => {
    const registerCommand = vi.fn();

    renderHook(() =>
      useAdminCommandRegistration({
        isLoaded: true,
        isSuperAdmin: false,
        registerCommand,
        unregisterCommand: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(registerCommand).not.toHaveBeenCalled();
    });
  });
});
