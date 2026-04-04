import type { ICommand } from '@genfeedai/interfaces/ui/command-palette.interface';
// @ts-expect-error storybook types not available
import type { Meta, StoryObj } from '@storybook/react';
import { CommandPaletteView } from '@ui/command-palette/command-palette/CommandPaletteView';
import type { RefObject } from 'react';
import { HiOutlineSparkles } from 'react-icons/hi2';

const sampleCommands: ICommand[] = [
  {
    action: () => undefined,
    category: 'navigation',
    description: 'Navigate to dashboard',
    icon: HiOutlineSparkles,
    id: 'cmd-open',
    label: 'Open Dashboard',
    shortcut: ['⌘', '1'],
  },
  {
    action: () => undefined,
    category: 'generation',
    description: 'Start a new generation',
    id: 'cmd-create',
    label: 'Create Asset',
    shortcut: ['⌘', 'Shift', 'G'],
  },
];

const noopRef = { current: null } as unknown as RefObject<HTMLInputElement>;

const meta = {
  args: {
    commands: sampleCommands,
    id: 'storybook-command-palette',
    inputRef: noopRef,
    noResultsMessage: 'No commands found',
    onClose: () => undefined,
    onQueryChange: () => undefined,
    onSelectCommand: () => undefined,
    placeholder: 'Search commands',
    query: '',
    selectedIndex: 0,
    totalCount: sampleCommands.length,
  },
  component: CommandPaletteView,
  parameters: {
    layout: 'centered',
  },
  title: 'Components/CommandPalette/CommandPalette',
} satisfies Meta<typeof CommandPaletteView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const EmptyState: Story = {
  args: {
    commands: [],
    query: 'Nope',
    totalCount: 0,
  },
};
