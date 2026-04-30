import PostDetail from '@pages/posts/detail/post-detail';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof PostDetail> = {
  component: PostDetail,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Pages/Posts/PostDetail',
};

export default meta;
type Story = StoryObj<typeof PostDetail>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
