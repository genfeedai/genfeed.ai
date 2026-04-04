import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarSpeechInput from '@ui/prompt-bars/components/speech-input/PromptBarSpeechInput';

const meta: Meta<typeof PromptBarSpeechInput> = {
  argTypes: {},
  component: PromptBarSpeechInput,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/PromptBars/PromptBarSpeechInput',
};

export default meta;
type Story = StoryObj<typeof PromptBarSpeechInput>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
