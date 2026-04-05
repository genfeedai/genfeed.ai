import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarTextareaSection from '@ui/prompt-bars/components/textarea-section/PromptBarTextareaSection';

const meta: Meta<typeof PromptBarTextareaSection> = {
  argTypes: {},
  component: PromptBarTextareaSection,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/PromptBars/PromptBarTextareaSection',
};

export default meta;
type Story = StoryObj<typeof PromptBarTextareaSection>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
