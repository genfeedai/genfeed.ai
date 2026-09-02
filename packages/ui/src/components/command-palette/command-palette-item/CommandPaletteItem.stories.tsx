import type { ICommand } from '@genfeedai/contracts/interfaces/ui/command-palette.interface';
// @ts-expect-error storybook types not available
import type { Meta, StoryObj } from '@storybook/react';
import { CommandPaletteItem } from '@ui/command-palette/command-palette-item/CommandPaletteItem';
import { Terminal } from 'lucide-react';

const sampleCommand: ICommand = {
  action: () => undefined,
  category: 'navigation',
  description: 'Jump to the Studio workspace',
  icon: Terminal,
  id: 'cmd-sample',
  label: 'Open Studio',
  shortcut: ['⌘', 'K'],
};

const meta = {
  args: {
    command: sampleCommand,
    isSelected: false,
  },
  component: CommandPaletteItem,
  title: 'Components/CommandPalette/CommandPaletteItem',
} satisfies Meta<typeof CommandPaletteItem>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: {
    onClick: () => {},
  },
};

export const Selected: Story = {
  args: {
    isSelected: true,
    onClick: () => {},
  },
};

export const WithStringIcon: Story = {
  args: {
    command: { ...sampleCommand, icon: '✨' },
    onClick: () => {},
  },
};
