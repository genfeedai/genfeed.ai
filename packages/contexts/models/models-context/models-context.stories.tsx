import ModelsContext from '@genfeedai/contexts/models/models-context/models-context';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof ModelsContext> = {
  component: ModelsContext,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Contexts/Models/ModelsContext',
};

export default meta;
type Story = StoryObj<typeof ModelsContext>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
