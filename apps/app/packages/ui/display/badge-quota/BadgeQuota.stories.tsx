import type { Meta, StoryObj } from '@storybook/nextjs';
import BadgeQuota from '@ui/display/badge-quota/BadgeQuota';

const meta: Meta<typeof BadgeQuota> = {
  argTypes: {},
  component: BadgeQuota,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/BadgeQuota',
};

export default meta;
type Story = StoryObj<typeof BadgeQuota>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
