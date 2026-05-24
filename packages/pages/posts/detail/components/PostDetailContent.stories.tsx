import PostDetailContent from '@pages/posts/detail/components/PostDetailContent';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof PostDetailContent> = {
  component: PostDetailContent,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Pages/Posts/PostDetailContent',
};

export default meta;
type Story = StoryObj<typeof PostDetailContent>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
