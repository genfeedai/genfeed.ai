import { useDefaultCommandsRegistration } from '@hooks/commands/use-default-commands-registration/use-default-commands-registration';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/commands.registry', () => ({
  registerDefaultCommands: vi.fn(),
}));

vi.mock('@services/core/logger.service', () => ({
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

import { useOrgUrl } from '@hooks/navigation/use-org-url/use-org-url';
import { registerDefaultCommands } from '@services/core/commands.registry';
import { logger } from '@services/core/logger.service';

describe('useDefaultCommandsRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('logs errors when registration fails', async () => {
    (useOrgUrl as ReturnType<typeof vi.fn>).mockReturnValue({
      brandSlug: 'test-brand',
      href: (path: string) => `/test-org/test-brand${path}`,
      orgHref: (path: string) => `/test-org/~${path}`,
      orgSlug: 'test-org',
    });

    (registerDefaultCommands as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        throw new Error('boom');
      },
    );

    renderHook(() => useDefaultCommandsRegistration());

    await waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to initialize command palette',
        {
          error: expect.any(Error),
        },
      );
    });
  });
});
