import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalGalleryContent from '@ui/modals/gallery/ModalGalleryContent';

const meta: Meta<typeof ModalGalleryContent> = {
  argTypes: {},
  component: ModalGalleryContent,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalGalleryContent',
};

export default meta;
type Story = StoryObj<typeof ModalGalleryContent>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
