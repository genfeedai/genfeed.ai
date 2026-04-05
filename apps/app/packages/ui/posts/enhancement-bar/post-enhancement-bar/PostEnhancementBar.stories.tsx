import type { Meta, StoryObj } from '@storybook/nextjs';
import PostEnhancementBar from '@ui/posts/enhancement-bar/post-enhancement-bar/PostEnhancementBar';

const meta: Meta<typeof PostEnhancementBar> = {
  argTypes: {
    // TODO: Add argTypes for component props
  },
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
  args: {
    // TODO: Add default props
  },
};

export const Interactive: Story = {
  args: {
    // TODO: Add interactive props
  },
};
