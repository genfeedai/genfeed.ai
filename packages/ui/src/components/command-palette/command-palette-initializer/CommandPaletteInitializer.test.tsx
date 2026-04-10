import { useUser } from '@clerk/nextjs';
import { getClerkPublicData } from '@genfeedai/helpers/auth/clerk.helper';
import { useAdminCommandRegistration } from '@genfeedai/hooks/commands/use-admin-command-registration/use-admin-command-registration';
import { useDefaultCommandsRegistration } from '@genfeedai/hooks/commands/use-default-commands-registration/use-default-commands-registration';
import { useCommandPalette } from '@genfeedai/hooks/ui/use-command-palette/use-command-palette';
import { render } from '@testing-library/react';
import { CommandPaletteInitializer } from '@ui/command-palette/command-palette-initializer/CommandPaletteInitializer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({
  useUser: vi.fn(),
}));

vi.mock('@genfeedai/helpers/auth/clerk.helper', () => ({
  getClerkPublicData: vi.fn(),
}));

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

const useUserMock = vi.mocked(useUser);
const getClerkPublicDataMock = vi.mocked(getClerkPublicData);
const useCommandPaletteMock = vi.mocked(useCommandPalette);
const useDefaultCommandsRegistrationMock = vi.mocked(
  useDefaultCommandsRegistration,
);
const useAdminCommandRegistrationMock = vi.mocked(useAdminCommandRegistration);

describe('CommandPaletteInitializer', () => {
  beforeEach(() => {
    useUserMock.mockReturnValue({ isLoaded: true, user: { id: 'user' } });
    getClerkPublicDataMock.mockReturnValue({ isSuperAdmin: true });
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
    getClerkPublicDataMock.mockReturnValue({ isSuperAdmin: false });
    render(<CommandPaletteInitializer />);

    expect(useAdminCommandRegistrationMock).toHaveBeenCalledWith(
      expect.objectContaining({ isSuperAdmin: false }),
    );
  });
});
