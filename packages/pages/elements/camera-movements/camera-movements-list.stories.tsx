import CameraMovementsList from '@pages/elements/camera-movements/camera-movements-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof CameraMovementsList> = {
  argTypes: {},
  component: CameraMovementsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Elements/CameraMovementsList',
};

export default meta;
type Story = StoryObj<typeof CameraMovementsList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
