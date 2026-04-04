import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarFormatControls from '@ui/prompt-bars/components/format-controls/PromptBarFormatControls';

const meta: Meta<typeof PromptBarFormatControls> = {
  argTypes: {},
  component: PromptBarFormatControls,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/PromptBars/PromptBarFormatControls',
};

export default meta;
type Story = StoryObj<typeof PromptBarFormatControls>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
