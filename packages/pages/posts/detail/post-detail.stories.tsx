import PostDetail from '@pages/posts/detail/post-detail';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof PostDetail> = {
  argTypes: {
    // TODO: Add argTypes for component props
  },
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
  args: {
    // TODO: Add default props
  },
};

export const Interactive: Story = {
  args: {
    // TODO: Add interactive props
  },
};
