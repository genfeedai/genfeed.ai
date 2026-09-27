import { useDefaultCommandsRegistration } from '@genfeedai/hooks/commands/use-default-commands-registration/use-default-commands-registration';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CommandPaletteInitializer from './CommandPaletteInitializer';

vi.mock(
  '@genfeedai/hooks/commands/use-default-commands-registration/use-default-commands-registration',
  () => ({ useDefaultCommandsRegistration: vi.fn() }),
);

describe('CommandPaletteInitializer', () => {
  it('registers default commands while app and Admin navigation belong to the rail', () => {
    render(<CommandPaletteInitializer />);
    expect(useDefaultCommandsRegistration).toHaveBeenCalledOnce();
  });
});
