import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalCameraMovement from '@ui/modals/elements/camera-movement/ModalCameraMovement';

const meta: Meta<typeof ModalCameraMovement> = {
  argTypes: {},
  component: ModalCameraMovement,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalCameraMovement',
};

export default meta;
type Story = StoryObj<typeof ModalCameraMovement>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
