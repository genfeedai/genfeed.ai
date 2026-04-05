import type { Meta, StoryObj } from '@storybook/nextjs';
import { CommandPaletteView } from '@ui/command-palette/command-palette/CommandPaletteView';

const meta: Meta<typeof CommandPaletteView> = {
  argTypes: {},
  component: CommandPaletteView,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/CommandPalette/CommandPaletteView',
};

export default meta;
type Story = StoryObj<typeof CommandPaletteView>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
