import type { Meta, StoryObj } from '@storybook/nextjs';
import QuickActionsMenu from '@ui/quick-actions/menu/QuickActionsMenu';

const meta: Meta<typeof QuickActionsMenu> = {
  argTypes: {},
  component: QuickActionsMenu,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/QuickActions/QuickActionsMenu',
};

export default meta;
type Story = StoryObj<typeof QuickActionsMenu>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
