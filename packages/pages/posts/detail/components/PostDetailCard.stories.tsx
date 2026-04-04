import PostDetailCard from '@pages/posts/detail/components/PostDetailCard';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof PostDetailCard> = {
  argTypes: {
    // TODO: Add argTypes for component props
  },
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
  args: {
    // TODO: Add default props
  },
};

export const Interactive: Story = {
  args: {
    // TODO: Add interactive props
  },
};
