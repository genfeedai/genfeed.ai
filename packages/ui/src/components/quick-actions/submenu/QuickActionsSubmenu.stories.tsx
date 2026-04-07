import type { Meta, StoryObj } from '@storybook/nextjs';
import QuickActionsSubmenu from '@ui/quick-actions/submenu/QuickActionsSubmenu';

const meta: Meta<typeof QuickActionsSubmenu> = {
  argTypes: {},
  component: QuickActionsSubmenu,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/QuickActions/QuickActionsSubmenu',
};

export default meta;
type Story = StoryObj<typeof QuickActionsSubmenu>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
