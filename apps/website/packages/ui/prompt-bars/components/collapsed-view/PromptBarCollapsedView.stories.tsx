import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarCollapsedView from '@ui/prompt-bars/components/collapsed-view/PromptBarCollapsedView';

const meta: Meta<typeof PromptBarCollapsedView> = {
  argTypes: {},
  component: PromptBarCollapsedView,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/PromptBars/PromptBarCollapsedView',
};

export default meta;
type Story = StoryObj<typeof PromptBarCollapsedView>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
