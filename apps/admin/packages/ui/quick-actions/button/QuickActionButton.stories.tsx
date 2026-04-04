import type { Meta, StoryObj } from '@storybook/nextjs';
import QuickActionButton from '@ui/quick-actions/button/QuickActionButton';

const meta: Meta<typeof QuickActionButton> = {
  argTypes: {},
  component: QuickActionButton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/QuickActions/QuickActionButton',
};

export default meta;
type Story = StoryObj<typeof QuickActionButton>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
