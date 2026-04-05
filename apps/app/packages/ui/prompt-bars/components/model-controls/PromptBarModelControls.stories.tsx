import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarModelControls from '@ui/prompt-bars/components/model-controls/PromptBarModelControls';

const meta: Meta<typeof PromptBarModelControls> = {
  argTypes: {},
  component: PromptBarModelControls,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/PromptBars/PromptBarModelControls',
};

export default meta;
type Story = StoryObj<typeof PromptBarModelControls>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
