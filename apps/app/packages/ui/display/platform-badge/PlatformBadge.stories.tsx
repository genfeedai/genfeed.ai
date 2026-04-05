import type { Meta, StoryObj } from '@storybook/nextjs';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';

const meta: Meta<typeof PlatformBadge> = {
  argTypes: {
    // TODO: Add argTypes for component props
  },
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
  args: {
    // TODO: Add default props
  },
};

export const Interactive: Story = {
  args: {
    // TODO: Add interactive props
  },
};
