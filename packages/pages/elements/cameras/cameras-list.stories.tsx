import CamerasList from '@pages/elements/cameras/cameras-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof CamerasList> = {
  argTypes: {},
  component: CamerasList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Elements/CamerasList',
};

export default meta;
type Story = StoryObj<typeof CamerasList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
