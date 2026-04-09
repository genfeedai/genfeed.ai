import PostsLayoutContext from '@genfeedai/contexts/posts/posts-layout-context';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof PostsLayoutContext> = {
  argTypes: {},
  component: PostsLayoutContext,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Contexts/Posts/PostsLayoutContext',
};

export default meta;
type Story = StoryObj<typeof PostsLayoutContext>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
