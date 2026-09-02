import type { ICommand } from '@genfeedai/contracts/interfaces/ui/command-palette.interface';
import { useAdminCommandRegistration } from '@hooks/commands/use-admin-command-registration/use-admin-command-registration';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('useAdminCommandRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers the admin command when loaded and super admin', async () => {
    const registerCommands = vi.fn();
    const unregisterCommands = vi.fn();

    const { unmount } = renderHook(() =>
      useAdminCommandRegistration({
        isLoaded: true,
        isSuperAdmin: true,
        registerCommands,
        unregisterCommands,
      }),
    );

    await waitFor(() => {
      expect(registerCommands).toHaveBeenCalledTimes(1);
    });

    const commands = registerCommands.mock.calls[0]?.[0] as ICommand[];
    expect(commands).toHaveLength(1);
    expect(commands[0]?.id).toBe('nav-admin');
    expect(typeof commands[0]?.action).toBe('function');
    expect(typeof commands[0]?.condition).toBe('function');

    unmount();

    expect(unregisterCommands).toHaveBeenCalledWith(['nav-admin']);
  });

  it('does not register when not loaded', async () => {
    const registerCommands = vi.fn();

    renderHook(() =>
      useAdminCommandRegistration({
        isLoaded: false,
        isSuperAdmin: true,
        registerCommands,
        unregisterCommands: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(registerCommands).not.toHaveBeenCalled();
    });
  });

  it('does not register when user is not super admin', async () => {
    const registerCommands = vi.fn();

    renderHook(() =>
      useAdminCommandRegistration({
        isLoaded: true,
        isSuperAdmin: false,
        registerCommands,
        unregisterCommands: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(registerCommands).not.toHaveBeenCalled();
    });
  });
});
