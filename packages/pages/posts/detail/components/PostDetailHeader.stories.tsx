import PostDetailHeader from '@pages/posts/detail/components/PostDetailHeader';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof PostDetailHeader> = {
  component: PostDetailHeader,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Pages/Posts/PostDetailHeader',
};

export default meta;
type Story = StoryObj<typeof PostDetailHeader>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
