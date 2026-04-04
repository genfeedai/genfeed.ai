import type { Meta, StoryObj } from '@storybook/nextjs';
import PostDetailSidebar from '@ui/posts/post-detail-sidebar/PostDetailSidebar';

const meta: Meta<typeof PostDetailSidebar> = {
  argTypes: {
    // TODO: Add argTypes for component props
  },
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
  args: {
    // TODO: Add default props
  },
};

export const Interactive: Story = {
  args: {
    // TODO: Add interactive props
  },
};
