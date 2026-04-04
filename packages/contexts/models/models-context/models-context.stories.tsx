import ModelsContext from '@contexts/models/models-context/models-context';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof ModelsContext> = {
  argTypes: {
    // TODO: Add argTypes for component props
  },
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
  args: {
    // TODO: Add default props
  },
};

export const Interactive: Story = {
  args: {
    // TODO: Add interactive props
  },
};
