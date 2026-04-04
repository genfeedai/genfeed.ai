import PostDetailContent from '@pages/posts/detail/components/PostDetailContent';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof PostDetailContent> = {
  argTypes: {
    // TODO: Add argTypes for component props
  },
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
  args: {
    // TODO: Add default props
  },
};

export const Interactive: Story = {
  args: {
    // TODO: Add interactive props
  },
};
