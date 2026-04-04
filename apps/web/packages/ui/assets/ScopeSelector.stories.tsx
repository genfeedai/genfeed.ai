import type { Meta, StoryObj } from '@storybook/nextjs';
import { ScopeSelector } from '@ui/assets/ScopeSelector';

const meta: Meta<typeof ScopeSelector> = {
  argTypes: {},
  component: ScopeSelector,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Assets/ScopeSelector',
};

export default meta;
type Story = StoryObj<typeof ScopeSelector>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
