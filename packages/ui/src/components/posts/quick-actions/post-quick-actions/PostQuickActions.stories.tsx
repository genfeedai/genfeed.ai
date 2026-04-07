import type { Meta, StoryObj } from '@storybook/nextjs';
import PostQuickActions from '@ui/posts/quick-actions/post-quick-actions/PostQuickActions';

const meta: Meta<typeof PostQuickActions> = {
  argTypes: {},
  component: PostQuickActions,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Posts/PostQuickActions',
};

export default meta;
type Story = StoryObj<typeof PostQuickActions>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
