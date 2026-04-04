import type { Meta, StoryObj } from '@storybook/nextjs';
import ParentsManager from '@ui/ingredients/parents-manager/ParentsManager';

const meta: Meta<typeof ParentsManager> = {
  argTypes: {},
  component: ParentsManager,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/ParentsManager',
};

export default meta;
type Story = StoryObj<typeof ParentsManager>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
