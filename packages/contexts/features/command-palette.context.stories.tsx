import { CommandPaletteProvider } from '@contexts/features/command-palette';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof CommandPaletteProvider> = {
  argTypes: {},
  component: CommandPaletteProvider,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Contexts/Features/CommandPalette.context',
};

export default meta;
type Story = StoryObj<typeof CommandPaletteProvider>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
