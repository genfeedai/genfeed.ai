import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarDivider from '@ui/prompt-bars/components/divider/PromptBarDivider';

const meta: Meta<typeof PromptBarDivider> = {
  component: PromptBarDivider,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/PromptBars/PromptBarDivider',
};

export default meta;
type Story = StoryObj<typeof PromptBarDivider>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
