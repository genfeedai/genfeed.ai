import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalGalleryItemMusic from '@ui/modals/gallery/items/ModalGalleryItemMusic';

const meta: Meta<typeof ModalGalleryItemMusic> = {
  argTypes: {},
  component: ModalGalleryItemMusic,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalGalleryItemMusic',
};

export default meta;
type Story = StoryObj<typeof ModalGalleryItemMusic>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
