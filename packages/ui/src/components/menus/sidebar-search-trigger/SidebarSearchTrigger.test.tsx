import { CommandPaletteProvider } from '@genfeedai/contexts/features/command-palette.provider';
import { useCommandPalette } from '@genfeedai/hooks/ui/use-command-palette/use-command-palette';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SidebarSearchTrigger from './SidebarSearchTrigger';

function PaletteState() {
  const { state } = useCommandPalette();
  return <output>{state.isOpen ? 'Palette open' : 'Palette closed'}</output>;
}

describe('SidebarSearchTrigger', () => {
  it('opens the same provider used by the keyboard shortcut', () => {
    render(
      <CommandPaletteProvider>
        <SidebarSearchTrigger />
        <PaletteState />
      </CommandPaletteProvider>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Open command palette' }),
    );
    expect(screen.getByText('Palette open')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByText('Palette closed')).toBeInTheDocument();
  });
});
