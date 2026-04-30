import type { Meta, StoryObj } from '@storybook/nextjs';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';

const meta: Meta<typeof PlatformBadge> = {
  component: PlatformBadge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Ui/PlatformBadge',
};

export default meta;
type Story = StoryObj<typeof PlatformBadge>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
