import type { Meta, StoryObj } from '@storybook/nextjs';
import QuickActionsContainer from '@ui/quick-actions/container/QuickActionsContainer';

const meta: Meta<typeof QuickActionsContainer> = {
  argTypes: {},
  component: QuickActionsContainer,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/QuickActions/QuickActionsContainer',
};

export default meta;
type Story = StoryObj<typeof QuickActionsContainer>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
