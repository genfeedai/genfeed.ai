import PostsList from '@pages/marketplace/posts/posts-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof PostsList> = {
  argTypes: {},
  component: PostsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/PostsList',
};

export default meta;
type Story = StoryObj<typeof PostsList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
