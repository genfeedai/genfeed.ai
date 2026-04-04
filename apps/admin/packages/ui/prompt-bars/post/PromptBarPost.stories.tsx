import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarPost from '@ui/prompt-bars/post/PromptBarPost';

const meta: Meta<typeof PromptBarPost> = {
  argTypes: {},
  component: PromptBarPost,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/PromptBars/PromptBarPost',
};

export default meta;
type Story = StoryObj<typeof PromptBarPost>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
