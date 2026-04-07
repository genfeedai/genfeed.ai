import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarPrimaryControlsRow from '@ui/prompt-bars/components/primary-controls-row/PromptBarPrimaryControlsRow';

const meta: Meta<typeof PromptBarPrimaryControlsRow> = {
  argTypes: {},
  component: PromptBarPrimaryControlsRow,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/PromptBars/PromptBarPrimaryControlsRow',
};

export default meta;
type Story = StoryObj<typeof PromptBarPrimaryControlsRow>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
