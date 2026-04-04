import type { Meta, StoryObj } from '@storybook/nextjs';
import PostsFilter from '@ui/posts/filter/posts-filter/PostsFilter';

const meta: Meta<typeof PostsFilter> = {
  argTypes: {},
  component: PostsFilter,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Posts/PostsFilter',
};

export default meta;
type Story = StoryObj<typeof PostsFilter>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
