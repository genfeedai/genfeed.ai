import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalModel from '@ui/modals/models/ModalModel';

const meta: Meta<typeof ModalModel> = {
  component: ModalModel,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Modals/ModalModel',
};

export default meta;
type Story = StoryObj<typeof ModalModel>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
