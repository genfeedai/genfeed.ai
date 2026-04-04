import PromptsList from '@pages/marketplace/prompts/prompts-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof PromptsList> = {
  argTypes: {},
  component: PromptsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/PromptsList',
};

export default meta;
type Story = StoryObj<typeof PromptsList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
