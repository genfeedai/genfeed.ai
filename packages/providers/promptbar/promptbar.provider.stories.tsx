import PromptBarProvider from '@providers/promptbar/promptbar.provider';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof PromptBarProvider> = {
  argTypes: {},
  component: PromptBarProvider,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Providers/Promptbar.provider.tsx/PromptBarProvider',
};

export default meta;
type Story = StoryObj<typeof PromptBarProvider>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
