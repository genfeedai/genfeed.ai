// @vitest-environment jsdom
import { CommandPaletteContext } from '@genfeedai/contexts/features/command-palette.context';
import { CommandPaletteProvider } from '@genfeedai/contexts/features/command-palette.provider';
import type {
  ICommand,
  ICommandPaletteContext,
} from '@genfeedai/contracts/interfaces/ui/command-palette.interface';
import { CommandPaletteService } from '@genfeedai/services/core/command-palette.service';
import { act, cleanup, render } from '@testing-library/react';
import { useContext } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let palette: ICommandPaletteContext;

function Consumer(): null {
  const context = useContext(CommandPaletteContext);
  if (!context) throw new Error('Command palette context is required');
  palette = context;
  return null;
}

function command(id: string, label: string): ICommand {
  return { action: vi.fn(), category: 'settings', id, label };
}

function mountPalette(): void {
  render(
    <CommandPaletteProvider>
      <Consumer />
    </CommandPaletteProvider>,
  );
}

describe('CommandPaletteProvider live registration', () => {
  beforeEach(() => {
    CommandPaletteService.clearCommands();
  });
  afterEach(() => {
    cleanup();
    CommandPaletteService.clearCommands();
  });

  it('shows commands registered directly after an empty palette opens', () => {
    mountPalette();
    act(() => {
      palette.open();
    });
    expect(palette.state.filteredCommands).toEqual([]);
    const appearance = command('appearance', 'Appearance');
    act(() => {
      CommandPaletteService.registerCommands([appearance]);
    });
    expect(palette.state.commands).toEqual([appearance]);
    expect(palette.state.filteredCommands).toEqual([appearance]);
    expect(palette.state.isOpen).toBe(true);
  });

  it('reapplies the active query when settings commands arrive after search', () => {
    mountPalette();
    act(() => {
      palette.open();
      palette.setQuery('Advanced Mode');
    });
    const advanced = command('advanced', 'Advanced Mode');
    act(() => {
      CommandPaletteService.registerCommands([
        command('appearance', 'Appearance'),
        advanced,
      ]);
    });
    expect(palette.state.filteredCommands).toEqual([advanced]);
    expect(palette.state.query).toBe('Advanced Mode');
    expect(palette.state.isOpen).toBe(true);
  });

  it('removes stale results and keeps keyboard selection valid after unregister', () => {
    const appearance = command('appearance', 'Appearance');
    const advanced = command('advanced', 'Advanced Mode');
    CommandPaletteService.registerCommands([appearance, advanced]);
    mountPalette();
    act(() => {
      palette.open();
      palette.selectNext();
    });
    expect(palette.state.selectedIndex).toBe(1);
    act(() => {
      CommandPaletteService.unregisterCommands(['advanced']);
    });
    expect(palette.state.filteredCommands).toEqual([appearance]);
    expect(palette.state.commands).toEqual([appearance]);
    expect(palette.state.selectedIndex).toBe(0);
    expect(palette.state.isOpen).toBe(true);
  });

  it('updates visible results for context registration and direct registry clearing', () => {
    mountPalette();
    act(() => {
      palette.open();
      palette.registerCommands([command('advanced', 'Advanced Mode')]);
    });
    expect(palette.state.filteredCommands.map(({ id }) => id)).toEqual([
      'advanced',
    ]);
    act(() => {
      CommandPaletteService.clearCommands();
    });
    expect(palette.state.filteredCommands).toEqual([]);
    expect(palette.state.commands).toEqual([]);
    expect(palette.state.selectedIndex).toBe(0);
  });
});
