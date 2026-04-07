import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalModel from '@ui/modals/models/ModalModel';

const meta: Meta<typeof ModalModel> = {
  argTypes: {
    // TODO: Add argTypes for component props
  },
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
  args: {
    // TODO: Add default props
  },
};

export const Interactive: Story = {
  args: {
    // TODO: Add interactive props
  },
};
