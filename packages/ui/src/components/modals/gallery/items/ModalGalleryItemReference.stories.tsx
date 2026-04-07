import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalGalleryItemReference from '@ui/modals/gallery/items/ModalGalleryItemReference';

const meta: Meta<typeof ModalGalleryItemReference> = {
  argTypes: {},
  component: ModalGalleryItemReference,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalGalleryItemReference',
};

export default meta;
type Story = StoryObj<typeof ModalGalleryItemReference>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
