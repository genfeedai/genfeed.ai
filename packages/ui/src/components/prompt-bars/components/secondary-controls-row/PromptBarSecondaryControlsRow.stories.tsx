import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarSecondaryControlsRow from '@ui/prompt-bars/components/secondary-controls-row/PromptBarSecondaryControlsRow';

const meta: Meta<typeof PromptBarSecondaryControlsRow> = {
  argTypes: {},
  component: PromptBarSecondaryControlsRow,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/PromptBars/PromptBarSecondaryControlsRow',
};

export default meta;
type Story = StoryObj<typeof PromptBarSecondaryControlsRow>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
