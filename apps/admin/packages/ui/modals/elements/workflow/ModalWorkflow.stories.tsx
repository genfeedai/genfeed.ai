import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalWorkflow from '@ui/modals/elements/workflow/ModalWorkflow';

const meta: Meta<typeof ModalWorkflow> = {
  argTypes: {},
  component: ModalWorkflow,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalWorkflow',
};

export default meta;
type Story = StoryObj<typeof ModalWorkflow>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
