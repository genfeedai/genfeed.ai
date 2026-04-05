import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalGalleryHeader from '@ui/modals/gallery/ModalGalleryHeader';

const meta: Meta<typeof ModalGalleryHeader> = {
  argTypes: {},
  component: ModalGalleryHeader,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalGalleryHeader',
};

export default meta;
type Story = StoryObj<typeof ModalGalleryHeader>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
