import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalGalleryItemVideo from '@ui/modals/gallery/items/ModalGalleryItemVideo';

const meta: Meta<typeof ModalGalleryItemVideo> = {
  argTypes: {},
  component: ModalGalleryItemVideo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalGalleryItemVideo',
};

export default meta;
type Story = StoryObj<typeof ModalGalleryItemVideo>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
