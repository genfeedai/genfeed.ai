import PostsGrid from '@pages/posts/list/components/PostsGrid';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof PostsGrid> = {
  argTypes: {},
  component: PostsGrid,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Pages/Posts/PostsGrid',
};

export default meta;
type Story = StoryObj<typeof PostsGrid>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
