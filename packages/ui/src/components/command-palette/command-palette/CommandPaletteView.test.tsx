import type { ICommand } from '@genfeedai/interfaces/ui/command-palette.interface';
import { render, screen } from '@testing-library/react';
import { CommandPaletteView } from '@ui/command-palette/command-palette/CommandPaletteView';
import type { RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@ui/command-palette/command-palette-item/CommandPaletteItem', () => ({
  CommandPaletteItem: ({ command }: { command: ICommand }) => (
    <div data-testid="command-item">{command.label}</div>
  ),
}));

const commands: ICommand[] = [
  {
    action: () => undefined,
    category: 'navigation',
    description: 'Navigate to dashboard',
    id: 'cmd-1',
    label: 'Open Dashboard',
  },
  {
    action: () => undefined,
    category: 'content',
    description: 'Start a new post',
    id: 'cmd-2',
    label: 'Create Post',
  },
];

describe('CommandPaletteView', () => {
  it('renders commands and footer count', () => {
    render(
      <CommandPaletteView
        id="palette"
        commands={commands}
        totalCount={2}
        selectedIndex={0}
        query=""
        maxResults={5}
        placeholder="Search commands"
        noResultsMessage="Nothing"
        inputRef={{ current: null } as RefObject<HTMLInputElement>}
        onClose={() => undefined}
        onQueryChange={() => undefined}
        onSelectCommand={() => undefined}
      />,
    );

    expect(screen.getByPlaceholderText('Search commands')).toBeInTheDocument();
    expect(screen.getByText('Open Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Create Post')).toBeInTheDocument();
    expect(screen.getByText('Commands')).toBeInTheDocument();
    expect(screen.getByText('2 of 2 commands')).toBeInTheDocument();
  });

  it('renders empty state when no commands are available', () => {
    render(
      <CommandPaletteView
        id="palette"
        commands={[]}
        totalCount={0}
        selectedIndex={0}
        query="query"
        noResultsMessage="No matches"
        inputRef={{ current: null } as RefObject<HTMLInputElement>}
        onClose={() => undefined}
        onQueryChange={() => undefined}
        onSelectCommand={() => undefined}
      />,
    );

    expect(screen.getByText('No matches')).toBeInTheDocument();
  });
});
