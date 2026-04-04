import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarArticle from '@ui/prompt-bars/article/PromptBarArticle';

const meta: Meta<typeof PromptBarArticle> = {
  argTypes: {},
  component: PromptBarArticle,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/PromptBars/PromptBarArticle',
};

export default meta;
type Story = StoryObj<typeof PromptBarArticle>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
