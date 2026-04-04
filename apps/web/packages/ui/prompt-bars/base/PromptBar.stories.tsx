import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBar from '@ui/prompt-bars/base/PromptBar';

const meta: Meta<typeof PromptBar> = {
  argTypes: {},
  component: PromptBar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/PromptBars/PromptBar',
};

export default meta;
type Story = StoryObj<typeof PromptBar>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
