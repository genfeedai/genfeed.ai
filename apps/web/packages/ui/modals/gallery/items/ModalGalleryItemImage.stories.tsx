import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalGalleryItemImage from '@ui/modals/gallery/items/ModalGalleryItemImage';

const meta: Meta<typeof ModalGalleryItemImage> = {
  argTypes: {},
  component: ModalGalleryItemImage,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalGalleryItemImage',
};

export default meta;
type Story = StoryObj<typeof ModalGalleryItemImage>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
