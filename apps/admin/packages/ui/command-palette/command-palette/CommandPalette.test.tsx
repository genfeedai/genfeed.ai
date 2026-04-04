import type { ICommand } from '@genfeedai/interfaces/ui/command-palette.interface';
import { render } from '@testing-library/react';
import { CommandPalette } from '@ui/command-palette/command-palette/CommandPalette';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useCommandPaletteMock = vi.fn();

vi.mock('@hooks/ui/use-command-palette/use-command-palette', () => ({
  useCommandPalette: (...args: unknown[]) => useCommandPaletteMock(...args),
}));

const viewMock = vi.fn(() => <div data-testid="command-palette-view" />);
vi.mock('./CommandPaletteView', () => ({
  CommandPaletteView: (props: unknown) => {
    viewMock(props);
    return <div data-testid="command-palette-view" />;
  },
}));

const dialogMock = vi.fn();
vi.mock(
  '@hooks/ui/use-command-palette-dialog/use-command-palette-dialog',
  () => ({
    useCommandPaletteDialog: (args: unknown) => {
      dialogMock(args);
    },
  }),
);

describe('CommandPalette', () => {
  const commands: ICommand[] = [
    { action: vi.fn(), category: 'actions', id: '1', label: 'First' },
    { action: vi.fn(), category: 'actions', id: '2', label: 'Second' },
  ];

  beforeEach(() => {
    useCommandPaletteMock.mockReturnValue({
      close: vi.fn(),
      executeCommand: vi.fn(),
      setQuery: vi.fn(),
      state: {
        filteredCommands: commands,
        isOpen: true,
        query: 'fir',
        selectedIndex: 0,
      },
    });
    viewMock.mockClear();
    dialogMock.mockClear();
  });

  it('passes command data to the view', () => {
    render(<CommandPalette maxResults={5} placeholder="Search" />);

    expect(viewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        commands,
        maxResults: 5,
        placeholder: 'Search',
        query: 'fir',
        totalCount: commands.length,
      }),
    );
  });

  it('invokes dialog hook with open state', () => {
    render(<CommandPalette />);
    expect(dialogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isOpen: true,
        modalId: 'command-palette-modal',
      }),
    );
  });
});
