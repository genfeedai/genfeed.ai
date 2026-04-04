import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalTraining from '@ui/modals/trainings/ModalTraining';

const meta: Meta<typeof ModalTraining> = {
  argTypes: {},
  component: ModalTraining,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalTraining',
};

export default meta;
type Story = StoryObj<typeof ModalTraining>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
