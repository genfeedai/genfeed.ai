import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarDivider from '@ui/prompt-bars/components/divider/PromptBarDivider';

const meta: Meta<typeof PromptBarDivider> = {
  argTypes: {
    // TODO: Add argTypes for component props
  },
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
  args: {
    // TODO: Add default props
  },
};

export const Interactive: Story = {
  args: {
    // TODO: Add interactive props
  },
};
