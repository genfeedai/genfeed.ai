import PostDetailCard from '@pages/posts/detail/components/PostDetailCard';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof PostDetailCard> = {
  component: PostDetailCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Pages/Posts/PostDetailCard',
};

export default meta;
type Story = StoryObj<typeof PostDetailCard>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
