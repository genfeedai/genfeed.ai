import PostDetailAnalytics from '@pages/posts/detail/components/PostDetailAnalytics';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof PostDetailAnalytics> = {
  component: PostDetailAnalytics,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Pages/Posts/PostDetailAnalytics',
};

export default meta;
type Story = StoryObj<typeof PostDetailAnalytics>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
