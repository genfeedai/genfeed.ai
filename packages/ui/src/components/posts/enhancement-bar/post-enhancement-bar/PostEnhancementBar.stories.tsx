import type { Meta, StoryObj } from '@storybook/nextjs';
import PostEnhancementBar from '@ui/posts/enhancement-bar/post-enhancement-bar/PostEnhancementBar';

const meta: Meta<typeof PostEnhancementBar> = {
  component: PostEnhancementBar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Posts/PostEnhancementBar',
};

export default meta;
type Story = StoryObj<typeof PostEnhancementBar>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
