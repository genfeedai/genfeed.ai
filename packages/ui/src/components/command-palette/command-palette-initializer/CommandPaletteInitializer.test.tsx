import { useAdminCommandRegistration } from '@genfeedai/hooks/commands/use-admin-command-registration/use-admin-command-registration';
import { useDefaultCommandsRegistration } from '@genfeedai/hooks/commands/use-default-commands-registration/use-default-commands-registration';
import { useCommandPalette } from '@genfeedai/hooks/ui/use-command-palette/use-command-palette';
import { render } from '@testing-library/react';
import { CommandPaletteInitializer } from '@ui/command-palette/command-palette-initializer/CommandPaletteInitializer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAccessStateMock = vi.fn();

vi.mock(
  '@genfeedai/contexts/providers/access-state/access-state.provider',
  () => ({
    useAccessState: () => useAccessStateMock(),
  }),
);

vi.mock('@genfeedai/hooks/ui/use-command-palette/use-command-palette', () => ({
  useCommandPalette: vi.fn(),
}));

vi.mock(
  '@genfeedai/hooks/commands/use-default-commands-registration/use-default-commands-registration',
  () => ({
    useDefaultCommandsRegistration: vi.fn(),
  }),
);

vi.mock(
  '@genfeedai/hooks/commands/use-admin-command-registration/use-admin-command-registration',
  () => ({
    useAdminCommandRegistration: vi.fn(),
  }),
);

const useCommandPaletteMock = vi.mocked(useCommandPalette);
const useDefaultCommandsRegistrationMock = vi.mocked(
  useDefaultCommandsRegistration,
);
const useAdminCommandRegistrationMock = vi.mocked(useAdminCommandRegistration);

describe('CommandPaletteInitializer', () => {
  beforeEach(() => {
    useAccessStateMock.mockReturnValue({
      accessState: null,
      canAccessApp: true,
      hasPaygCredits: false,
      isByok: false,
      isLoading: false,
      isSubscribed: false,
      isSuperAdmin: true,
      needsOnboarding: false,
      refreshAccessState: vi.fn(),
    });
    useCommandPaletteMock.mockReturnValue({
      registerCommand: vi.fn(),
      unregisterCommand: vi.fn(),
    });
  });

  it('registers hooks with derived values', () => {
    render(<CommandPaletteInitializer />);

    expect(useDefaultCommandsRegistrationMock).toHaveBeenCalled();
    expect(useAdminCommandRegistrationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isLoaded: true,
        isSuperAdmin: true,
      }),
    );
  });

  it('handles non super admin users', () => {
    useAccessStateMock.mockReturnValue({
      accessState: null,
      canAccessApp: false,
      hasPaygCredits: false,
      isByok: false,
      isLoading: false,
      isSubscribed: false,
      isSuperAdmin: false,
      needsOnboarding: false,
      refreshAccessState: vi.fn(),
    });
    render(<CommandPaletteInitializer />);

    expect(useAdminCommandRegistrationMock).toHaveBeenCalledWith(
      expect.objectContaining({ isSuperAdmin: false }),
    );
  });
});
