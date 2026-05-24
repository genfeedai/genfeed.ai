import type { Meta, StoryObj } from '@storybook/nextjs';
import PostDetailSidebar from '@ui/posts/post-detail-sidebar/PostDetailSidebar';

const meta: Meta<typeof PostDetailSidebar> = {
  component: PostDetailSidebar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Posts/PostDetailSidebar',
};

export default meta;
type Story = StoryObj<typeof PostDetailSidebar>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
