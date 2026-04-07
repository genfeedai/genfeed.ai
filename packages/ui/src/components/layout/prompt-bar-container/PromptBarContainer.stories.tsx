import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';

const meta: Meta<typeof PromptBarContainer> = {
  argTypes: {},
  component: PromptBarContainer,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/PromptBarContainer',
};

export default meta;
type Story = StoryObj<typeof PromptBarContainer>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
