import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalImageToVideo from '@ui/modals/ingredients/image-to-video/ModalImageToVideo';

const meta: Meta<typeof ModalImageToVideo> = {
  argTypes: {},
  component: ModalImageToVideo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalImageToVideo',
};

export default meta;
type Story = StoryObj<typeof ModalImageToVideo>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
