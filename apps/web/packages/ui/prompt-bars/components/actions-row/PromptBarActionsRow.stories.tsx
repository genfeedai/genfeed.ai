import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarActionsRow from '@ui/prompt-bars/components/actions-row/PromptBarActionsRow';

const meta: Meta<typeof PromptBarActionsRow> = {
  argTypes: {},
  component: PromptBarActionsRow,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/PromptBars/PromptBarActionsRow',
};

export default meta;
type Story = StoryObj<typeof PromptBarActionsRow>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
