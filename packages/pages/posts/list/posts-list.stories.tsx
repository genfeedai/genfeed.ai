import PostsList from '@pages/posts/list/posts-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof PostsList> = {
  argTypes: {},
  component: PostsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Posts/PostsList',
};

export default meta;
type Story = StoryObj<typeof PostsList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
